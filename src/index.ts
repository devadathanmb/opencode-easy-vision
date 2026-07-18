import type { Plugin } from "@opencode-ai/plugin";
import { PLUGIN_NAME } from "./constants.js";
import { loadPluginConfig, getImageAnalysisTool } from "./config.js";
import { modelMatchesAnyPattern } from "./patterns.js";
import { isImageFilePart, extractImagesFromParts } from "./images.js";
import { generateInjectionPrompt } from "./prompt.js";
import {
  isTextPart,
  findLastUserMessage,
  getModelFromMessage,
  removeProcessedImageParts,
  withUpdatedTextPart,
} from "./transform.js";
import { cleanupOldTempFiles } from "./cleanup.js";
import type { Logger, Notifier } from "./types.js";

export const EasyVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;

  const log: Logger = (msg) => {
    client.app
      .log({ body: { service: PLUGIN_NAME, level: "info", message: msg } })
      .catch(() => {});
  };

  function makeNotifyMethod(
    level: "warn" | "error",
    variant: "warning" | "error",
  ) {
    return (message: string, title?: string) => {
      client.app
        .log({ body: { service: PLUGIN_NAME, level, message } })
        .catch(() => {});
      client.tui
        .showToast({ body: { title, message, variant, duration: 5000 } })
        .catch(() => {});
    };
  }

  const notify: Notifier = {
    warn: makeNotifyMethod("warn", "warning"),
    error: makeNotifyMethod("error", "error"),
  };

  await loadPluginConfig(directory, log);
  await cleanupOldTempFiles(log);
  log("Plugin initialized");

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;

      const result = findLastUserMessage(messages);
      if (!result) return;

      const { message: lastUserMessage, index: lastUserIndex } = result;

      const model = getModelFromMessage(lastUserMessage);
      if (!modelMatchesAnyPattern(model)) return;

      const hasImages = lastUserMessage.parts.some(isImageFilePart);
      if (!hasImages) return;

      log("Found images in message, processing");

      // Collect all image part IDs up front so failed saves are also removed from the
      // message — otherwise raw data: blobs stay in parts and the model can't use them.
      const allImagePartIds = new Set(
        lastUserMessage.parts.filter(isImageFilePart).map((p) => p.id),
      );

      const savedImages = await extractImagesFromParts(
        lastUserMessage.parts,
        log,
        notify,
      );
      if (savedImages.length === 0) {
        log("Failed to process any attached images");
        notify.error(
          "Could not process attached images. Check logs for details.",
          "Easy Vision",
        );
        messages[lastUserIndex] = {
          ...lastUserMessage,
          parts: removeProcessedImageParts(
            lastUserMessage.parts,
            allImagePartIds,
          ),
        };
        return;
      }

      if (savedImages.length < allImagePartIds.size) {
        notify.warn(
          `${savedImages.length} of ${allImagePartIds.size} image(s) were processed successfully. Some images could not be saved.`,
          "Easy Vision",
        );
      }

      log(`Saved ${savedImages.length} image(s), injecting tool instructions`);

      const existingTextPart = lastUserMessage.parts.find(isTextPart);
      const userText = existingTextPart?.text ?? "";

      const transformedText = generateInjectionPrompt(
        savedImages,
        userText,
        getImageAnalysisTool(),
      );

      const trimmedParts = removeProcessedImageParts(
        lastUserMessage.parts,
        allImagePartIds,
      );
      messages[lastUserIndex] = {
        ...lastUserMessage,
        parts: withUpdatedTextPart(
          { ...lastUserMessage, parts: trimmedParts },
          transformedText,
        ),
      };
    },
  };
};

export default EasyVisionPlugin;
