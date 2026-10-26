import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { Plugin } from "@opencode/plugin";

// This probe handles synthetic inline PNGs only; it is not the production adapter.
export default Plugin.define({
  id: "easy-vision-v2-spike",
  async setup(ctx) {
    const root = ctx.location.directory;
    const record = (value) =>
      appendFile(join(root, "hooks.jsonl"), JSON.stringify(value) + "\n");
    await record({ lifecycle: "setup", version: ctx.app.version });
    // A private server may accept its first prompt before MCP startup completes.
    // Waiting at admission is fixture orchestration, not production prompt rewriting.
    await ctx.session.hook("prompt", async () => {
      const name = ctx.options.live ? "Vision" : "MiniMax";
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const servers = await ctx.mcp.list();
        const server = servers.data.find((entry) => entry.name === name);
        const tools = await ctx.tool.list();
        if (
          server?.status.status === "connected" &&
          tools.some((tool) => tool.id === `${name}_understand_image`)
        ) {
          await record({ readiness: "connected", server: name });
          return;
        }
        if (
          server &&
          server.status.status !== "pending" &&
          server.status.status !== "connected"
        ) {
          throw new Error(`Probe MCP ${name} is ${server.status.status}`);
        }
        await setTimeout(100);
      }
      throw new Error(`Probe MCP ${name} did not connect before admission`);
    });
    if (!ctx.options.live) {
      // `run --file` rejects empty CLI messages; clear this fixture-only
      // sentinel at admission to exercise actual attachment-only context.
      await ctx.session.hook("prompt", (event) => {
        if (event.prompt.text === "SPIKE_IMAGE_ONLY_SENTINEL") {
          event.prompt.text = "";
        }
      });
      await ctx.session.hook("model.request", (event) => {
        event.headers["x-spike-kind"] = event.kind;
      });
    }
    await ctx.session.hook("context", async (event) => {
      const registry = await ctx.tool.list();
      await record({
        requestTools: Object.keys(event.tools),
        registry: registry.map((tool) => tool.id),
      });
      if (ctx.options.live && !event.tools[ctx.options.toolName]) {
        throw new Error(
          "Configured vision tool is absent from the live request tool list",
        );
      }
      if (ctx.options.productionEntry) {
        await record({
          model: { providerID: event.model.providerID, id: event.model.id },
          sources: event.messages.flatMap((message) =>
            message.role === "user"
              ? message.content
                  .filter(
                    (part) =>
                      part.type === "media" && part.media.kind === "image",
                  )
                  .map((part) => part.media.source.type)
              : [],
          ),
          tools: Object.keys(event.tools),
        });
        return;
      }
      const paths = [];
      const sources = [];
      const messages = [];
      for (const message of event.messages) {
        const content = [];
        for (const part of message.content) {
          if (
            message.role !== "user" ||
            part.type !== "media" ||
            part.media.kind !== "image"
          ) {
            content.push(part);
            continue;
          }
          const source = part.media.source;
          sources.push(source.type);
          if (source.type !== "bytes" && source.type !== "base64") {
            throw new Error(
              `Probe expects inline PNG, received ${source.type}`,
            );
          }
          const bytes =
            source.type === "bytes"
              ? source.data
              : Buffer.from(source.data, "base64");
          const hash = createHash("sha256")
            .update(bytes)
            .update(part.media.mediaType)
            .digest("hex");
          await mkdir(join(root, "images"), { recursive: true });
          const path = join(root, "images", `easy-vision-${hash}.png`);
          await writeFile(path, bytes);
          paths.push(path);
          content.push({
            type: "text",
            text: ctx.options.live
              ? `Attached image saved at ${path}. Use the ${ctx.options.toolName} tool with this path to analyze it before answering. Do not guess the image contents.`
              : `SPIKE_IMAGE_PATH=${path}`,
          });
        }
        messages.push({ ...message, content });
      }
      event.messages = messages;
      await record({
        model: { providerID: event.model.providerID, id: event.model.id },
        sources,
        paths,
        tools: Object.keys(event.tools),
      });
    });
    return async () => {
      await record({ lifecycle: "unload" });
    };
  },
});
