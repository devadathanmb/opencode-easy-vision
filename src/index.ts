import type { Plugin } from "@opencode/plugin/effect";
import type { Logger, Notifier } from "./types.js";
import { Effect } from "effect";
import { PLUGIN_NAME } from "./constants.js";
import { createConfigStore } from "./config.js";
import { cleanupOldTempFiles } from "./cleanup.js";
import { createCodeModeTransform } from "./codemode.js";
import { createRequestRewriter } from "./request.js";

// The Effect API is used only for this shell: OpenCode drops plugin console
// output, but Effect logs inherit the host logger and reach OpenCode's log file.
// `effect` resolves to the host's instance at runtime.
export const EasyVisionPlugin: Plugin.Plugin = {
  id: "opencode-easy-vision",
  effect: Effect.fn(function* (ctx) {
    const services = yield* Effect.context<never>();
    const run = Effect.runPromiseWith(services);
    const emit = (effect: Effect.Effect<void>) => {
      Effect.runForkWith(services)(
        effect.pipe(Effect.annotateLogs("plugin", PLUGIN_NAME)),
      );
    };
    const log: Logger = (message) => emit(Effect.logInfo(message));
    const notify: Notifier = {
      warn: (message) => emit(Effect.logWarning(message)),
      error: (message) => emit(Effect.logError(message)),
    };

    const config = createConfigStore();
    yield* Effect.promise(() => config.load(ctx.location.directory, log));
    yield* Effect.promise(() => cleanupOldTempFiles(config, log));

    const requests = createRequestRewriter(
      config,
      {
        directory: ctx.location.directory,
        getSessionDirectory: (sessionID) =>
          run(ctx.session.get({ sessionID })).then(
            (session) => session.location.directory,
          ),
        listTools: () => run(ctx.tool.list()),
      },
      log,
      notify,
    );

    yield* ctx.mcp.transform(
      createCodeModeTransform(
        config.getImageAnalysisTool,
        config.getDisableCodeMode,
        log,
      ),
    );
    yield* ctx.session.hook("context", (event) =>
      Effect.promise(() => requests.rewrite(event, false, event.tools)),
    );
    yield* ctx.session.hook("compaction", (event) =>
      Effect.promise(() => requests.rewrite(event, true)),
    );
    yield* ctx.session.hook("title", (event) =>
      Effect.promise(() => requests.rewrite(event, true)),
    );
    // Transient generation is deliberately neutral: it must not initiate image analysis.
    yield* ctx.session.hook("generate", (event) =>
      Effect.promise(() => requests.rewrite(event, true)),
    );
    yield* Effect.addFinalizer(() => Effect.sync(requests.dispose));
    log("Plugin initialized");
  }),
};

export default EasyVisionPlugin;
