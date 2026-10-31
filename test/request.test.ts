import type { RequestHost } from "../src/request.js";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createConfigStore } from "../src/config.js";
import { createRequestRewriter } from "../src/request.js";
import {
  hasMedia,
  image,
  recorder,
  sessionRequest as request,
  tempDir,
  text,
  textOf,
  user,
} from "./helpers.js";

const TOOL = "Vision_understand_image";

async function setup(
  overrides: (directory: string) => Partial<RequestHost> = () => ({}),
) {
  const directory = await tempDir();
  const host = overrides(directory);
  const config = createConfigStore({
    models: ["test/*"],
    imageAnalysisTool: TOOL,
    tempDir: join(directory, "images"),
  });
  const getSessionDirectory = vi.fn(
    host.getSessionDirectory ?? (async () => directory),
  );
  const listTools = vi.fn(host.listTools ?? (async () => []));
  const { log, notify, messages } = recorder();
  const rewriter = createRequestRewriter(
    config,
    { directory, getSessionDirectory, listTools },
    log,
    notify,
  );
  return { rewriter, getSessionDirectory, listTools, warnings: messages.warn };
}

describe("createRequestRewriter", () => {
  it("ignores requests for models that do not match", async () => {
    const s = await setup();
    const event = request([user([image()])], { providerID: "other" });
    const original = event.messages;
    await s.rewriter.rewrite(event, false, { [TOOL]: {} });
    expect(event.messages).toBe(original);
    expect(s.getSessionDirectory).not.toHaveBeenCalled();
  });

  it("ignores requests without user images", async () => {
    const s = await setup();
    const event = request([user([text("hi")])]);
    const original = event.messages;
    await s.rewriter.rewrite(event, false, { [TOOL]: {} });
    expect(event.messages).toBe(original);
    expect(s.getSessionDirectory).not.toHaveBeenCalled();
  });

  it("ignores sessions that belong to another project location", async () => {
    const s = await setup(() => ({
      getSessionDirectory: async () => "/elsewhere",
    }));
    const event = request([user([image()])]);
    const original = event.messages;
    await s.rewriter.rewrite(event, false, { [TOOL]: {} });
    expect(event.messages).toBe(original);
    expect(s.listTools).not.toHaveBeenCalled();
  });

  it("treats equivalent location paths as the same location", async () => {
    const s = await setup((directory) => ({
      getSessionDirectory: async () => `${directory}/./`,
    }));
    const event = request([user([image()])]);
    await s.rewriter.rewrite(event, false, { [TOOL]: {} });
    expect(hasMedia(event.messages[0])).toBe(false);
  });

  it("rewrites with direct-tool guidance when the request exposes the tool", async () => {
    const s = await setup();
    const event = request([user([text("what is it?"), image()])]);
    await s.rewriter.rewrite(event, false, { [TOOL]: {} });
    expect(hasMedia(event.messages[0])).toBe(false);
    expect(textOf(event.messages[0])).toContain(`Use the \`${TOOL}\` tool`);
    expect(textOf(event.messages[0])).not.toContain("Code Mode");
    expect(s.warnings).toEqual([]);
  });

  it("routes through execute when the tool is behind Code Mode", async () => {
    const s = await setup(() => ({ listTools: async () => [{ id: TOOL }] }));
    const event = request([user([image()])]);
    await s.rewriter.rewrite(event, false, { execute: {} });
    expect(textOf(event.messages[0])).toContain("exposed through Code Mode");
  });

  it("warns once per session when the tool is unavailable", async () => {
    const s = await setup();
    for (const sessionID of ["ses_a", "ses_a", "ses_b"]) {
      const event = request([user([image()])], { sessionID });
      await s.rewriter.rewrite(event, false, {});
      expect(textOf(event.messages[0])).toContain(`${TOOL} is not available`);
    }
    expect(s.warnings).toHaveLength(2);
    expect(s.warnings[0]).toContain(`Vision tool ${TOOL} is unavailable`);
  });

  it("neither looks up tools nor warns for paths-only requests", async () => {
    const s = await setup();
    const event = request([user([image()])]);
    await s.rewriter.rewrite(event, true);
    expect(s.listTools).not.toHaveBeenCalled();
    expect(s.warnings).toEqual([]);
    expect(textOf(event.messages[0])).not.toContain("Use the");
  });

  it("warns once per session for repeated image failures", async () => {
    const s = await setup();
    const gif = () => image(undefined, "image/gif");
    await s.rewriter.rewrite(request([user([gif()])]), false, { [TOOL]: {} });
    await s.rewriter.rewrite(request([user([gif()])]), false, { [TOOL]: {} });
    expect(s.warnings).toEqual(["Unsupported image format (image/gif)"]);
  });

  it("strips images and warns when a host lookup fails", async () => {
    const s = await setup(() => ({
      listTools: async () => {
        throw new Error("private provider response");
      },
    }));
    const event = request([user([text("keep"), image()])]);
    await s.rewriter.rewrite(event, false, {});
    expect(hasMedia(event.messages[0])).toBe(false);
    expect(textOf(event.messages[0])).toContain("attachment processing failed");
    expect(JSON.stringify(event.messages)).not.toContain("private provider");
    expect(s.warnings).toEqual([
      "Image processing failed; see the attachment failure note in model context.",
    ]);
  });

  it("forgets the oldest warnings beyond 256 so memory stays bounded", async () => {
    const s = await setup();
    for (let i = 0; i <= 256; i++)
      await s.rewriter.rewrite(
        request([user([image()])], { sessionID: `ses_${i}` }),
        false,
        {},
      );
    expect(s.warnings).toHaveLength(257);
    await s.rewriter.rewrite(
      request([user([image()])], { sessionID: "ses_0" }),
      false,
      {},
    );
    expect(s.warnings).toHaveLength(258);
  });

  it("warns again after dispose", async () => {
    const s = await setup();
    await s.rewriter.rewrite(request([user([image()])]), false, {});
    s.rewriter.dispose();
    await s.rewriter.rewrite(request([user([image()])]), false, {});
    expect(s.warnings).toHaveLength(2);
  });
});
