import type { Message, Part, TextPart } from "@opencode-ai/sdk";
import { randomUUID } from "node:crypto";
import type { ModelInfo } from "./types.js";

export function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

// The transformation flow:
// 1. Find the last user message (most recent request)
// 2. Extract and save any images from its parts
// 3. Remove the image parts (they can't be sent to the model)
// 4. Replace/update the text part with injection instructions

export function findLastUserMessage(
  messages: Array<{ info: Message; parts: Part[] }>,
): { message: { info: Message; parts: Part[] }; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      return { message: messages[i], index: i };
    }
  }
  return null;
}

export function getModelFromMessage(message: {
  info: Message;
}): ModelInfo | undefined {
  const info = message.info as { model?: ModelInfo };
  return info.model;
}

export function removeProcessedImageParts(
  parts: Part[],
  processedIds: Set<string>,
): Part[] {
  // Remove image parts that were successfully processed; they've been converted
  // to file paths in the injection prompt and the model can't interpret raw images.
  return parts.filter(
    (part) => !(part.type === "file" && processedIds.has(part.id)),
  );
}

export function withUpdatedTextPart(
  message: { info: Message; parts: Part[] },
  newText: string,
): Part[] {
  const textPartIndex = message.parts.findIndex(isTextPart);

  if (textPartIndex !== -1) {
    return message.parts.map((part, i) =>
      i === textPartIndex ? ({ ...part, text: newText } as TextPart) : part,
    );
  }

  const newTextPart: TextPart = {
    id: `transformed-${randomUUID()}`,
    sessionID: message.info.sessionID,
    messageID: message.info.id,
    type: "text",
    text: newText,
    synthetic: true,
  };
  return [newTextPart, ...message.parts];
}
