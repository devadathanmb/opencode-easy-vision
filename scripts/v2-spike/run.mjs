import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const baseline = "2.1.4";
const productionEntry = process.argv[2]
  ? pathToFileURL(process.argv[2]).href
  : undefined;
const source = dirname(fileURLToPath(import.meta.url));
const root = await mkdtemp(join(tmpdir(), "easy-vision-v2-spike-"));
console.log(`Probe artifacts: ${root}`);
const home = join(root, "home");
await mkdir(home, { recursive: true });
// Deliberate allowlist: do not inherit provider keys, config overrides, or service addresses.
const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: root,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_HOME: join(home, "data"),
  XDG_CACHE_HOME: join(home, "cache"),
  XDG_STATE_HOME: join(home, "state"),
  OPENCODE_CLI_CONFIG_CONTENT: "{}",
};
async function command(binary, args, cwd, label, timeout = 120_000) {
  const child = spawn(binary, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    await writeFile(join(root, `${label}.log`), output);
    assert.equal(
      code,
      0,
      `${label} failed; inspect ${join(root, `${label}.log`)}`,
    );
    return output;
  } finally {
    clearTimeout(timer);
  }
}
const version = await command("opencode", ["--version"], root, "version");
assert.match(version, /\bv2\.1\.4\b/, `Probe requires OpenCode ${baseline}`);
const plugin = join(root, "plugin");
await mkdir(plugin);
await copyFile(join(source, "plugin.mjs"), join(plugin, "index.mjs"));
if (productionEntry) {
  const code = await readFile(join(plugin, "index.mjs"), "utf8");
  // Plugin.define is an identity helper. The observer fixture needs no SDK
  // installation; the actual installed package must resolve its own dependency.
  await writeFile(
    join(plugin, "index.mjs"),
    code.replace(
      'import { Plugin } from "@opencode/plugin";',
      "const Plugin = { define: (definition) => definition };",
    ),
  );
}
await writeFile(
  join(plugin, "package.json"),
  JSON.stringify({
    name: "easy-vision-v2-spike",
    private: true,
    type: "module",
    main: "index.mjs",
    dependencies: productionEntry ? {} : { "@opencode/plugin": baseline },
  }),
);
if (!productionEntry)
  await command(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    plugin,
    "install",
  );
const after = join(root, "after");
if (productionEntry) {
  await mkdir(after);
  await copyFile(join(source, "after.mjs"), join(after, "index.mjs"));
  await writeFile(
    join(after, "package.json"),
    JSON.stringify({
      name: "easy-vision-after",
      type: "module",
      main: "index.mjs",
    }),
  );
}
await copyFile(join(source, "mcp.mjs"), join(root, "mcp.mjs"));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
const image = join(root, "fixture.png");
await writeFile(image, png);
const requests = [];
const errors = [];
// Route the model must see in the current mode: "direct" or "execute".
let expectedRoute;
const server = createServer(async (req, res) => {
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const primary = req.headers["x-spike-kind"] === "primary";
    if (primary) {
      requests.push(body);
      assert(
        !JSON.stringify(body.messages).includes("image_url"),
        "Raw image reached provider",
      );
    }
    const previous = body.messages.some((message) => message.role === "tool");
    const text = body.messages
      .flatMap((message) =>
        typeof message.content === "string"
          ? [message.content]
          : (message.content ?? [])
              .filter((part) => part.type === "text")
              .map((part) => part.text),
      )
      .join("\n");
    const path = text.match(
      /(?:SPIKE_IMAGE_PATH=|Attached image: )([^\s]+)/,
    )?.[1];
    let delta = { content: primary ? "SPIKE_DONE" : "Fixture title" };
    let finish = "stop";
    if (primary && !previous) {
      assert(path, "Saved path missing from provider context");
      const names = (body.tools ?? []).map((tool) => tool.function?.name);
      const direct = names.includes("MiniMax_understand_image");
      assert(direct || names.includes("execute"), "Vision route unavailable");
      assert.equal(
        direct ? "direct" : "execute",
        expectedRoute,
        "Vision tool exposed through the wrong route",
      );
      const name = direct ? "MiniMax_understand_image" : "execute";
      const args = direct
        ? { path }
        : {
            code: `return await tools.MiniMax.understand_image(${JSON.stringify({ path })});`,
          };
      delta = {
        tool_calls: [
          {
            index: 0,
            id: "call_spike",
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
      finish = "tool_calls";
    }
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta, finish_reason) => ({
        id: "fixture",
        object: "chat.completion.chunk",
        created: 0,
        model: "text-only",
        choices: [{ index: 0, delta, finish_reason }],
      });
      res.write(
        `data: ${JSON.stringify(chunk({ role: "assistant", ...delta }, null))}\n\n`,
      );
      res.end(`data: ${JSON.stringify(chunk({}, finish))}\n\ndata: [DONE]\n\n`);
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "fixture",
          object: "chat.completion",
          created: 0,
          model: "text-only",
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
    }
  } catch (error) {
    errors.push(error);
    res.writeHead(500);
    res.end("Fixture assertion failed");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const jsonLines = async (path) =>
  (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
try {
  // direct: `codemode: false` set by the user. codemode: `codemode: true` set by
  // the user, so the tool must stay behind execute. auto: unset, so the production
  // plugin disables Code Mode and the probe plugin leaves it on.
  for (const mode of ["direct", "codemode", "auto"]) {
    expectedRoute =
      mode === "direct" || (mode === "auto" && productionEntry)
        ? "direct"
        : "execute";
    const project = join(root, mode);
    await mkdir(project);
    const callsFile = join(project, "calls.jsonl");
    await writeFile(
      join(project, "opencode.json"),
      JSON.stringify({
        plugins: [
          { package: plugin, options: { productionEntry } },
          ...(productionEntry
            ? [dirname(dirname(fileURLToPath(productionEntry))), after]
            : []),
        ],
        model: "spike/text-only",
        providers: {
          spike: {
            name: "Isolated fixture",
            package: "@opencode/ai/providers/openai-compatible",
            settings: {
              baseURL: `http://127.0.0.1:${server.address().port}/v1`,
              apiKey: "fixture-not-a-secret",
            },
            models: {
              "text-only": {
                capabilities: {
                  tools: true,
                  input: ["text"],
                  output: ["text"],
                },
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
              command: [process.execPath, join(root, "mcp.mjs")],
              environment: { SPIKE_CALLS: callsFile },
              ...(mode === "auto" ? {} : { codemode: mode === "codemode" }),
            },
          },
        },
      }),
    );
    if (productionEntry) {
      await mkdir(join(project, ".opencode"));
      await writeFile(
        join(project, ".opencode/opencode-easy-vision.json"),
        JSON.stringify({
          models: ["spike/text-only"],
          imageAnalysisTool: "MiniMax_understand_image",
          tempDir: join(project, "images"),
        }),
      );
    }
    const start = requests.length;
    for (const [label, text] of [
      ["text", "SPIKE_ORIGINAL_REQUEST"],
      ["image-only", ""],
    ]) {
      const args = [
        "run",
        "--standalone",
        "--format",
        "json",
        "--model",
        "spike/text-only",
        "--file",
        image,
      ];
      args.push(text || "SPIKE_IMAGE_ONLY_SENTINEL");
      const output = await command(
        "opencode",
        args,
        project,
        `${mode}-${label}`,
      );
      assert.match(output, /SPIKE_DONE/);
    }
    assert.equal(errors.length, 0, errors[0]?.message);
    const hooks = await jsonLines(join(project, "hooks.jsonl"));
    const contexts = hooks.filter((hook) => hook.model);
    assert(
      contexts.length >= 4,
      "Context hook did not run on tool continuations",
    );
    assert(
      contexts.every(
        (hook) =>
          hook.model.providerID === "spike" && hook.model.id === "text-only",
      ),
    );
    assert(
      contexts.every((hook) => hook.sources.length > 0),
      "Persisted media not available on every pass",
    );
    const paths = (
      productionEntry ? hooks.filter((hook) => hook.processed) : contexts
    ).flatMap((hook) => hook.paths);
    assert.equal(new Set(paths).size, 1, "Saved paths changed between passes");
    assert.deepEqual(await readFile(paths[0]), png);
    const calls = await jsonLines(callsFile);
    assert.equal(
      calls.length,
      2,
      "Expected one real fixture MCP call per task",
    );
    assert(calls.every((call) => call.path === paths[0]));
    assert(requests.length >= start + 4);
    assert(
      JSON.stringify(requests[start].messages).includes(
        "SPIKE_ORIGINAL_REQUEST",
      ),
    );
    await writeFile(
      join(project, "outbound.json"),
      JSON.stringify(requests.slice(start), null, 2),
    );
    console.log(
      `PASS ${mode} (${expectedRoute}): media, original text, image-only, continuation, stable path, MCP read`,
    );
  }
  console.log(
    `OpenCode ${baseline} synthetic runtime probe passed. Real vision and lifecycle gates remain.`,
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
