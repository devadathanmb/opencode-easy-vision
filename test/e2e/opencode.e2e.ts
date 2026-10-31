import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMAGE_ONLY } from "./harness/index.js";

// Drives the real `opencode` binary with the packed plugin installed, a fake
// OpenAI-compatible provider for a text-only model and a fake vision MCP server.
// Build first; `just e2e` does. Nothing here calls a real model or service.

const run = promisify(execFile);
const repo = new URL("../..", import.meta.url).pathname;
const TOOL = "MiniMax_understand_image";
const MODEL = "e2e/text-only";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

interface ChatRequest {
  messages: { role: string; content: unknown }[];
  tools?: { function?: { name?: string } }[];
}

const textOf = (request: ChatRequest) => JSON.stringify(request.messages);
const savedPath = (request: ChatRequest) =>
  textOf(request).match(/Attached image: ([^\s\\]+)/)?.[1];
const isContinuation = (request: ChatRequest) =>
  request.messages.some((message) => message.role === "tool");

let root: string;
let pluginDir: string;
let image: string;
let env: NodeJS.ProcessEnv;
// Main (non-title) requests the fake provider received, in order.
const requests: ChatRequest[] = [];
const provider = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const request = JSON.parse(body) as ChatRequest & { stream?: boolean };
  const primary = req.headers["x-e2e-kind"] === "primary";
  if (primary) requests.push(request);

  // First turn: call the vision tool through whichever route is exposed.
  // Afterwards (and for title requests): finish with plain text.
  let delta: object = { content: "E2E_DONE" };
  let finish = "stop";
  const path = savedPath(request);
  if (primary && !isContinuation(request) && path) {
    const names = (request.tools ?? []).map((tool) => tool.function?.name);
    const [name, args] = names.includes(TOOL)
      ? [TOOL, { path }]
      : [
          "execute",
          {
            code: `return await tools.MiniMax.understand_image(${JSON.stringify({ path })});`,
          },
        ];
    delta = {
      tool_calls: [
        {
          index: 0,
          id: "call_e2e",
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    };
    finish = "tool_calls";
  }

  const base = { id: "e2e", created: 0, model: "text-only" };
  if (!request.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ...base,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", ...delta },
            finish_reason: finish,
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    return;
  }
  const chunk = (delta: object, finish_reason: string | null) =>
    `data: ${JSON.stringify({
      ...base,
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason }],
    })}\n\n`;
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(chunk({ role: "assistant", ...delta }, null));
  res.end(`${chunk({}, finish)}data: [DONE]\n\n`);
});

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "easy-vision-e2e-"));
  // Install the packed tarball, as npm users would get it.
  const { stdout } = await run(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", root],
    { cwd: repo },
  );
  const install = join(root, "install");
  await mkdir(install);
  await writeFile(join(install, "package.json"), "{}");
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(root, stdout.trim()),
    ],
    { cwd: install },
  );
  pluginDir = join(install, "node_modules/opencode-easy-vision");

  image = join(root, "image.png");
  await writeFile(image, PNG);
  await new Promise<void>((resolve) =>
    provider.listen(0, "127.0.0.1", resolve),
  );

  // Isolate OpenCode from the developer's config, credentials and service.
  const home = join(root, "home");
  env = {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: root,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_STATE_HOME: join(home, "state"),
    OPENCODE_CLI_CONFIG_CONTENT: "{}",
  };
}, 120_000);

afterAll(async () => {
  provider.close();
  if (root) await rm(root, { recursive: true, force: true });
});

async function createProject(name: string, codemode: boolean | undefined) {
  const project = join(root, name);
  const calls = join(project, "calls.jsonl");
  await mkdir(join(project, ".opencode"), { recursive: true });
  const { port } = provider.address() as AddressInfo;
  await writeFile(
    join(project, "opencode.json"),
    JSON.stringify({
      plugins: [pluginDir, join(repo, "test/e2e/harness")],
      model: MODEL,
      providers: {
        e2e: {
          name: "E2E fake provider",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "none" },
          models: {
            "text-only": {
              capabilities: { tools: true, input: ["text"], output: ["text"] },
              limit: { context: 32000, output: 1000 },
            },
          },
        },
      },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
      mcp: {
        servers: {
          MiniMax: {
            type: "local",
            command: [process.execPath, join(repo, "test/e2e/mcp-server.ts")],
            environment: { E2E_CALLS: calls },
            ...(codemode === undefined ? {} : { codemode }),
          },
        },
      },
    }),
  );
  await writeFile(
    join(project, ".opencode/opencode-easy-vision.jsonc"),
    JSON.stringify({ models: [MODEL], tempDir: join(project, "images") }),
  );
  return { project, calls };
}

async function ask(project: string, text: string) {
  const running = run(
    "opencode",
    ["run", "--standalone", "--model", MODEL, "--file", image, text],
    { cwd: project, env, timeout: 120_000 },
  );
  // `opencode run` reads piped stdin as extra input; give it none.
  running.child.stdin?.end();
  return (await running).stdout;
}

describe.each([
  { name: "codemode unset", codemode: undefined, route: TOOL },
  { name: "codemode false", codemode: false, route: TOOL },
  { name: "codemode true", codemode: true, route: "execute" },
])("OpenCode with $name", ({ name, codemode, route }) => {
  it(`replaces the image with a saved path and the model reaches it via ${route}`, async () => {
    const { project, calls } = await createProject(
      name.replace(/ /g, "-"),
      codemode,
    );
    const start = requests.length;
    expect(await ask(project, "what is in this image?")).toContain("E2E_DONE");
    expect(await ask(project, IMAGE_ONLY)).toContain("E2E_DONE");
    const sent = requests.slice(start);

    // Two tasks, each a first request plus at least one tool continuation.
    expect(sent.filter(isContinuation).length).toBeGreaterThanOrEqual(2);
    // The text-only model never receives the raw image.
    for (const request of sent)
      expect(textOf(request)).not.toContain("image_url");
    // The user's text survives, and the vision tool is offered on the expected route.
    expect(textOf(sent[0])).toContain("what is in this image?");
    // The image-only task reaches the model with no typed text.
    const imageOnly = sent.filter((request) => !isContinuation(request))[1];
    expect(textOf(imageOnly)).toContain("(analyze the image)");
    expect(textOf(imageOnly)).not.toContain(IMAGE_ONLY);
    const offered = (sent[0].tools ?? []).map((tool) => tool.function?.name);
    expect(offered).toContain(route);
    if (route === "execute") expect(offered).not.toContain(TOOL);

    // One stable saved path on every pass, holding the original bytes.
    const paths = new Set(sent.map(savedPath));
    expect(paths.size).toBe(1);
    const [path] = paths;
    expect(path).toMatch(/[0-9a-f]{64}\.png$/);
    expect(await readFile(path!)).toEqual(PNG);

    // The MCP server read that file once per task.
    const lines = (await readFile(calls, "utf8")).trim().split("\n");
    expect(lines.map((line) => JSON.parse(line).path)).toEqual([path, path]);
  }, 240_000);
});
