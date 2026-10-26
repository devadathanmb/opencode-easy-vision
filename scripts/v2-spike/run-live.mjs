import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("Set OPENROUTER_API_KEY before launching the test");
const source = dirname(fileURLToPath(import.meta.url));
const project = resolve(source, "../../.opencode/v2-test");
const home = await mkdtemp(join(tmpdir(), "easy-vision-v2-live-home-"));
await mkdir(join(home, "config"), { recursive: true });
await copyFile(join(source, "plugin.mjs"), join(project, "plugin/index.mjs"));
const image = process.argv[2]
  ? resolve(process.argv[2])
  : join(project, "red.png");
if (!process.argv[2]) {
  await writeFile(
    image,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      "base64",
    ),
  );
}
const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: home,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_HOME: join(home, "data"),
  XDG_CACHE_HOME: join(home, "cache"),
  XDG_STATE_HOME: join(home, "state"),
  OPENCODE_CLI_CONFIG_CONTENT: "{}",
  OPENROUTER_API_KEY: key,
};
console.log(
  "Running live V2 probe; sends the test image to OpenRouter and incurs API charges.",
);
console.log(`Isolated OpenCode state: ${home}`);
const child = spawn(
  "opencode",
  [
    "run",
    "--standalone",
    "--format",
    "json",
    "--file",
    image,
    "Use the vision tool to describe the attached image. What colors do you see?",
  ],
  { cwd: project, env, stdio: ["ignore", "pipe", "inherit"] },
);
let output = "";
child.stdout.on("data", (data) => {
  output += data;
  process.stdout.write(data);
});
const timer = setTimeout(() => child.kill("SIGKILL"), 180_000);
try {
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 0, "Live OpenCode invocation failed");
  const events = output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map(JSON.parse);
  const calls = events.filter(
    (event) =>
      event.type === "tool_use" &&
      event.part?.tool === "Vision_understand_image" &&
      event.part.state?.status === "completed",
  );
  assert(
    calls.length > 0,
    "No completed vision MCP invocation; tool-call-shaped text is not success",
  );
  assert(
    calls.some((call) =>
      /[0-9a-f]{64}\.(png|jpg|webp)$/.test(call.part.state.input.path),
    ),
    "Vision MCP did not use a plugin-generated image path",
  );
  assert(
    !events.some((event) => event.type === "error"),
    "Live request emitted an error",
  );
  assert(
    events.some((event) => event.type === "text" && event.part?.text),
    "No model answer",
  );
  console.log(
    "PASS: text-only model -> saved PNG -> real vision MCP invocation -> answer",
  );
} finally {
  clearTimeout(timer);
}
