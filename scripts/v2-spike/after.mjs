import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

// Loaded after the real package. This fixture observes only; it never rewrites.
export default {
  id: "easy-vision-v2-after",
  async setup(ctx) {
    await ctx.session.hook("context", async (event) => {
      const plugins = await ctx.plugin.list();
      await appendFile(
        join(ctx.location.directory, "hooks.jsonl"),
        JSON.stringify({
          plugins: plugins.data.map((plugin) => ({
            id: plugin.id,
            state: plugin.state,
            source: plugin.source,
          })),
        }) + "\n",
      );
      const paths = event.messages.flatMap((message) =>
        message.content
          .filter(
            (part) =>
              part.type === "text" &&
              part.text.trim().startsWith("Attached image: "),
          )
          .map((part) => part.text.trim().slice("Attached image: ".length)),
      );
      assert(
        paths.length > 0,
        "Production package did not replace the attached image; check native entrypoint loading",
      );
      await appendFile(
        join(ctx.location.directory, "hooks.jsonl"),
        JSON.stringify({ processed: true, paths }) + "\n",
      );
    });
  },
};
