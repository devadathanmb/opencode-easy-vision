import type { Plugin } from "@opencode/plugin";
import { setTimeout } from "node:timers/promises";

// Test-only plugin loaded next to Easy Vision. It never touches images.
export const IMAGE_ONLY = "E2E_IMAGE_ONLY";

const harness: Plugin.Plugin = {
  id: "easy-vision-e2e-harness",
  async setup(ctx) {
    // `opencode run` can admit a prompt before the MCP server has registered its
    // tools; hold admission until the vision tool is in the catalog.
    await ctx.session.hook("prompt", async () => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const tools = await ctx.tool.list();
        if (tools.some((tool) => tool.id === "MiniMax_understand_image"))
          return;
        await setTimeout(100);
      }
      throw new Error("MiniMax MCP server did not register its tool in time");
    });
    // `opencode run --file` rejects an empty message, so image-only prompts
    // carry a placeholder that is cleared before it is stored.
    await ctx.session.hook("prompt", (event) => {
      if (event.prompt.text === IMAGE_ONLY) event.prompt.text = "";
    });
    // Lets the fake provider tell the main request from title generation.
    await ctx.session.hook("model.request", (event) => {
      event.headers["x-e2e-kind"] = event.kind;
    });
  },
};

export default harness;
