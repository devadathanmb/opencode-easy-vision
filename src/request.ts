import type { SessionRequest } from "@opencode/plugin/effect/session";
import type {
  ConfigAccessors,
  Logger,
  Notifier,
  RegisteredTool,
} from "./types.js";
import { resolve } from "node:path";
import { createModelMatcher } from "./patterns.js";
import { createImageProcessor } from "./images.js";
import { createPromptGenerator } from "./prompt.js";
import {
  isImagePart,
  stripImagesAfterFailure,
  transformMessages,
} from "./transform.js";
import { resolveToolRoute } from "./tool-route.js";

// Host lookups as Promises so request rewriting stays plain async code.
export interface RequestHost {
  readonly directory: string;
  getSessionDirectory(sessionID: SessionRequest["sessionID"]): Promise<string>;
  listTools(): Promise<readonly RegisteredTool[]>;
}

export function createRequestRewriter(
  config: ConfigAccessors,
  host: RequestHost,
  log: Logger,
  notify: Notifier,
) {
  const matches = createModelMatcher(config);
  const process = createImageProcessor(config, log);
  const prompt = createPromptGenerator(config);
  const warnings = new Set<string>();
  const warnOnce = (key: string, message: string) => {
    if (warnings.has(key)) return;
    if (warnings.size >= 256) {
      const oldest = warnings.values().next().value;
      if (oldest !== undefined) warnings.delete(oldest);
    }
    warnings.add(key);
    notify.warn(message);
  };

  const rewrite = async (
    event: SessionRequest,
    pathsOnly: boolean,
    tools: Record<string, unknown> = {},
  ): Promise<void> => {
    if (
      !matches({ providerID: event.model.providerID, modelID: event.model.id })
    )
      return;
    if (
      !event.messages.some(
        (message) =>
          message.role === "user" && message.content.some(isImagePart),
      )
    )
      return;
    try {
      const sessionDirectory = await host.getSessionDirectory(event.sessionID);
      if (resolve(sessionDirectory) !== resolve(host.directory)) return;
      const registered = pathsOnly ? [] : await host.listTools();
      const route = resolveToolRoute(
        config.getImageAnalysisTool(),
        tools,
        registered,
      );
      if (!pathsOnly && route === "unavailable")
        warnOnce(
          `${event.sessionID}:tool`,
          `Vision tool ${config.getImageAnalysisTool()} is unavailable in this request. Check MCP connection, tool name, exposure, and permissions.`,
        );
      event.messages = await transformMessages(event.messages, {
        process,
        prompt,
        route,
        pathsOnly,
        onFailure: (reason, index) =>
          warnOnce(`${event.sessionID}:${index}:${reason}`, reason),
      });
    } catch {
      // Still remove the images: the text-only model cannot accept them.
      event.messages = stripImagesAfterFailure(event.messages);
      warnOnce(
        `${event.sessionID}:unexpected`,
        "Image processing failed; see the attachment failure note in model context.",
      );
    }
  };

  return { rewrite, dispose: () => warnings.clear() };
}
