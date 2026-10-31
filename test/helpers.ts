import type { ContentPart, Message } from "@opencode/ai";
import type { MCPEditor } from "@opencode/plugin/effect/mcp";
import type { SessionRequest } from "@opencode/plugin/effect/session";
import type { PluginConfig, Logger, Notifier } from "../src/types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Media } from "@opencode/ai";
import { onTestFinished } from "vitest";
import { createConfigStore } from "../src/config.js";
import { createImageProcessor } from "../src/images.js";
import { createPromptGenerator } from "../src/prompt.js";

export type MediaPart = Extract<ContentPart, { type: "media" }>;

// A real PNG signature plus one byte: enough for MIME-agnostic byte handling.
export const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);

export const silent: Logger = () => {};

export function image(
  bytes: Uint8Array = PNG_BYTES,
  mime = "image/png",
): MediaPart {
  return {
    type: "media",
    media: Media.bytes(bytes, mime),
    metadata: { attachment: "original" },
  };
}

export function media(mime: string): MediaPart {
  return { type: "media", media: Media.bytes(PNG_BYTES, mime) };
}

export function text(value: string): ContentPart {
  return { type: "text", text: value };
}

export function user(
  content: ContentPart[],
  extra: Partial<Pick<Message, "id" | "metadata">> = {},
): Message {
  return { role: "user", content, ...extra };
}

export function assistant(content: ContentPart[]): Message {
  return { role: "assistant", content };
}

export function hasMedia(message: Message): boolean {
  return message.content.some((part) => part.type === "media");
}

export function textOf(message: Message): string {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

/** Creates a temp directory that is removed when the current test finishes. */
export async function tempDir(prefix = "easy-vision-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Logger/Notifier pair that records every message by level. */
export function recorder() {
  const messages = { info: [] as string[], warn: [] as string[] };
  const log: Logger = (message) => messages.info.push(message);
  const notify: Notifier = { warn: (message) => messages.warn.push(message) };
  return { log, notify, messages };
}

/** Config, image processor and prompt generator writing into a fresh temp dir. */
export async function fixture(config: PluginConfig = {}) {
  const dir = await tempDir();
  const store = createConfigStore({
    tempDir: dir,
    imageAnalysisTool: "Vision_understand_image",
    ...config,
  });
  return {
    tempDir: dir,
    config: store,
    process: createImageProcessor(store, silent),
    prompt: createPromptGenerator(store),
    route: "direct" as const,
  };
}

// SessionRequest uses branded IDs; tests build plain strings and cast once here.
export function sessionRequest(
  messages: Message[],
  options: { sessionID?: string; providerID?: string; id?: string } = {},
): SessionRequest {
  const plain = {
    sessionID: options.sessionID ?? "ses_test",
    model: {
      providerID: options.providerID ?? "test",
      id: options.id ?? "model",
    },
    system: [],
    messages,
    options: {},
  };
  return plain as unknown as SessionRequest;
}

type ServerConfig = NonNullable<ReturnType<MCPEditor["get"]>>;

/** In-memory MCP editor over local servers; `set`/`remove` must not be used. */
export function mcpEditor(
  servers: Record<string, { codemode?: boolean }>,
): MCPEditor {
  const configs: Record<string, ServerConfig> = Object.fromEntries(
    Object.entries(servers).map(([name, config]) => [
      name,
      { type: "local", command: ["server"], ...config },
    ]),
  );
  return {
    list: () => Object.entries(configs),
    get: (name) => configs[name],
    set: () => {
      throw new Error("set must not be used");
    },
    update: (name, update) => update(configs[name]),
    remove: () => {
      throw new Error("remove must not be used");
    },
  };
}
