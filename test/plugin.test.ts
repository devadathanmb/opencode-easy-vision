import type { MCPEditor } from "@opencode/plugin/effect/mcp";
import type { Plugin } from "@opencode/plugin/effect";
import type { SessionRequest } from "@opencode/plugin/effect/session";
import { mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Logger, References, Scope } from "effect";
import { describe, expect, it, vi } from "vitest";
import EasyVisionPlugin from "../src/index.js";
import {
  PNG_BYTES,
  hasMedia,
  image,
  mcpEditor,
  sessionRequest,
  tempDir,
  text,
  textOf,
  user,
} from "./helpers.js";

const TOOL = "Vision_understand_image";
type Hook = (event: SessionRequest) => Effect.Effect<void>;

interface LogEntry {
  message: string;
  level: string;
  annotations: Record<string, unknown>;
}

/**
 * Runs the real plugin effect against fake OpenCode domains, with a capturing
 * logger installed the way the host provides its own.
 */
async function start(
  options: { config?: object; tools?: { id: string; options?: object }[] } = {},
) {
  const root = await tempDir("easy-vision-plugin-");
  const directory = join(root, "project");
  const home = join(root, "home");
  vi.stubEnv("HOME", home);
  await mkdir(join(directory, ".opencode"), { recursive: true });
  await writeFile(
    join(directory, ".opencode/opencode-easy-vision.jsonc"),
    JSON.stringify({
      models: ["test/*"],
      imageAnalysisTool: TOOL,
      tempDir: join(directory, "images"),
      ...options.config,
    }),
  );

  const hooks = new Map<string, Hook>();
  const mcpTransforms: ((editor: MCPEditor) => void)[] = [];
  const session = {
    directory,
    toolList: Effect.succeed(options.tools ?? []) as Effect.Effect<
      unknown[],
      Error
    >,
  };
  const registration = Effect.succeed({ dispose: Effect.void });
  const fake = {
    location: { directory },
    options: {},
    mcp: {
      transform: (callback: (editor: MCPEditor) => void) => {
        mcpTransforms.push(callback);
        return registration;
      },
    },
    tool: { list: () => session.toolList },
    session: {
      get: () => Effect.succeed({ location: { directory: session.directory } }),
      hook: (name: string, callback: Hook) => {
        hooks.set(name, callback);
        return registration;
      },
    },
  };
  // The full Context has ~25 domains; the plugin only touches these.
  const ctx = fake as unknown as Plugin.Context;

  const logs: LogEntry[] = [];
  const capture = Logger.make((entry) =>
    logs.push({
      message: [entry.message].flat().join(" "),
      level: entry.logLevel,
      annotations: entry.fiber.getRef(References.CurrentLogAnnotations),
    }),
  );
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(
    EasyVisionPlugin.effect(ctx).pipe(
      Scope.provide(scope),
      Effect.provide(Logger.layer([capture])),
    ),
  );

  const run = async (name: string, event: SessionRequest) => {
    const hook = hooks.get(name);
    if (!hook) throw new Error(`hook ${name} was not registered`);
    await Effect.runPromise(hook(event));
    return event;
  };
  const close = () => Effect.runPromise(Scope.close(scope, Exit.void));
  return { directory, home, hooks, mcpTransforms, session, logs, run, close };
}

describe("EasyVisionPlugin", () => {
  it("has a stable id", () => {
    expect(EasyVisionPlugin.id).toBe("opencode-easy-vision");
  });

  it("registers the MCP transform and the four request hooks", async () => {
    const p = await start();
    expect(p.mcpTransforms).toHaveLength(1);
    expect([...p.hooks.keys()]).toEqual([
      "context",
      "compaction",
      "title",
      "generate",
    ]);
    await p.close();
  });

  it("logs through the host logger, tagged with the plugin name", async () => {
    // Regression: OpenCode discards plugin console output, so logs must go
    // through the Effect logger the host provides.
    const p = await start();
    await vi.waitFor(() =>
      expect(p.logs).toContainEqual({
        message: "Plugin initialized",
        level: "Info",
        annotations: { plugin: "easy-vision" },
      }),
    );
    expect(
      p.logs.every((log) => log.annotations.plugin === "easy-vision"),
    ).toBe(true);
    await p.close();
  });

  it("rewrites images in the context hook using the request's tools", async () => {
    const p = await start();
    const event = await p.run(
      "context",
      sessionRequest([user([text("what is it?"), image()])], {}),
    );
    expect(hasMedia(event.messages[0])).toBe(false);
    expect(textOf(event.messages[0])).toContain("is not available");
    const direct = sessionRequest([user([image()])]);
    Object.assign(direct, { tools: { [TOOL]: {} } });
    await p.run("context", direct);
    expect(textOf(direct.messages[0])).toContain(`Use the \`${TOOL}\` tool`);
    await p.close();
  });

  it("uses the tool registry to detect Code Mode", async () => {
    const p = await start({ tools: [{ id: TOOL }] });
    const event = sessionRequest([user([image()])]);
    Object.assign(event, { tools: { execute: {} } });
    await p.run("context", event);
    expect(textOf(event.messages[0])).toContain("exposed through Code Mode");
    await p.close();
  });

  it.each(["compaction", "title", "generate"])(
    "gives the %s hook image paths only",
    async (name) => {
      const p = await start();
      const event = await p.run(name, sessionRequest([user([image()])]));
      expect(hasMedia(event.messages[0])).toBe(false);
      expect(textOf(event.messages[0])).toContain("Attached image:");
      expect(textOf(event.messages[0])).not.toContain("Use the");
      await p.close();
    },
  );

  it("leaves requests from another location untouched", async () => {
    const p = await start();
    p.session.directory = "/somewhere/else";
    const event = sessionRequest([user([image()])]);
    const original = event.messages;
    await p.run("context", event);
    expect(event.messages).toBe(original);
    await p.close();
  });

  it("logs a warning and strips images when a host call fails", async () => {
    const p = await start();
    p.session.toolList = Effect.fail(new Error("private provider response"));
    const event = await p.run("context", sessionRequest([user([image()])]));
    expect(hasMedia(event.messages[0])).toBe(false);
    await vi.waitFor(() =>
      expect(p.logs).toContainEqual(
        expect.objectContaining({
          level: "Warn",
          message: expect.stringContaining("Image processing failed"),
        }),
      ),
    );
    expect(JSON.stringify(p.logs)).not.toContain("private provider response");
    await p.close();
  });

  it("clears warning state when its scope closes", async () => {
    const p = await start();
    const warnings = () => p.logs.filter((log) => log.level === "Warn").length;
    await p.run("context", sessionRequest([user([image()])]));
    await p.run("context", sessionRequest([user([image()])]));
    await vi.waitFor(() => expect(warnings()).toBe(1));
    await p.close();
    await p.run("context", sessionRequest([user([image()])]));
    await vi.waitFor(() => expect(warnings()).toBe(2));
  });

  it("wires the MCP transform to the loaded config", async () => {
    const p = await start({ config: { imageAnalysisTool: "Mine_tool" } });
    const editor = mcpEditor({ Mine: {}, Vision: {} });
    p.mcpTransforms[0](editor);
    expect(editor.get("Mine")?.codemode).toBe(false);
    expect(editor.get("Vision")?.codemode).toBeUndefined();
    await p.close();
  });

  it("cleans expired images from the configured temp dir on startup", async () => {
    const root = await tempDir();
    const images = join(root, "images");
    await mkdir(images);
    const expired = join(images, `${"a".repeat(64)}.png`);
    await writeFile(expired, PNG_BYTES);
    await utimes(expired, new Date(0), new Date(0));
    const p = await start({ config: { tempDir: images } });
    expect(await readdir(images)).toEqual([]);
    await p.close();
  });

  it("creates the example user config on first start", async () => {
    const p = await start();
    const created = await readFile(
      join(p.home, ".config/opencode/opencode-easy-vision.jsonc"),
      "utf8",
    );
    expect(created).toContain(
      `"imageAnalysisTool": "MiniMax_understand_image"`,
    );
    await p.close();
  });
});
