import type { ContentPart, Message } from "@opencode/ai";
import type {
  ImageAttachment,
  ImageResult,
  SavedImage,
  ToolRoute,
} from "./types.js";
import { normalizeMime } from "./images.js";

export function isImagePart(part: ContentPart): boolean {
  return (
    part.type === "media" &&
    (part.media.kind === "image" ||
      normalizeMime(part.media.mediaType).startsWith("image/"))
  );
}

export function normalizeAttachment(
  part: ContentPart,
): ImageAttachment | undefined {
  if (part.type !== "media" || !isImagePart(part)) return undefined;
  return {
    mime: normalizeMime(part.media.mediaType),
    source: part.media.source,
    requiresHeaders: Object.keys(part.media.headers ?? {}).length > 0,
  };
}

const marker = { easyVision: true };

// OpenCode flattens skills and attachments into plain text parts alongside the
// user's own text (core session/runner/to-llm-message.ts). Only the typed text
// belongs in {userText}; the rest stays in place but must not be duplicated.
const CORE_TEXT_PREFIXES = ["<skill_content", "Attached file: "];

function isUserTypedText(part: ContentPart): boolean {
  if (part.type !== "text" || part.metadata !== undefined) return false;
  return !CORE_TEXT_PREFIXES.some((prefix) => part.text.startsWith(prefix));
}

export async function transformMessages(
  messages: readonly Message[],
  options: {
    process: (attachment: ImageAttachment) => Promise<ImageResult>;
    prompt: (
      images: readonly SavedImage[],
      text: string,
      route: ToolRoute,
    ) => string;
    route: ToolRoute;
    neutral?: boolean;
    onFailure?: (reason: string, messageIndex: number) => void;
  },
): Promise<Message[]> {
  let lastUser = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") lastUser = index;
  });
  return Promise.all(
    messages.map(async (message, messageIndex) => {
      if (message.role !== "user" || !message.content.some(isImagePart))
        return message;
      const images: SavedImage[] = [];
      const failures: string[] = [];
      const content: ContentPart[] = [];
      for (const part of message.content) {
        const attachment = normalizeAttachment(part);
        if (!attachment) {
          // Discard only our previous generated guidance when a later plugin
          // reintroduces media into an already transformed context.
          if (part.type !== "text" || part.metadata?.easyVision !== true)
            content.push(part);
          continue;
        }
        let result: ImageResult;
        try {
          result = await options.process(attachment);
        } catch {
          result = {
            ok: false,
            reason:
              "Unexpected image-processing failure; attach the image again or check server logs",
          };
        }
        if (result.ok) {
          images.push(result.image);
          content.push({
            type: "text",
            text: `\nAttached image: ${result.image.path}\n`,
            metadata: {
              ...(part.type === "media" ? part.metadata : {}),
              ...marker,
            },
          });
        } else {
          failures.push(result.reason);
          options.onFailure?.(result.reason, messageIndex);
          content.push({
            type: "text",
            text: `\nEasy Vision attachment failure: ${result.reason}\n`,
            metadata: {
              ...(part.type === "media" ? part.metadata : {}),
              ...marker,
            },
          });
        }
      }
      if (images.length && messageIndex === lastUser && !options.neutral) {
        const originalText = message.content
          .filter(isUserTypedText)
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
        content.push({
          type: "text",
          text: options.prompt(images, originalText, options.route),
          metadata: marker,
        });
      }
      if (failures.length)
        content.push({
          type: "text",
          metadata: marker,
          text: `Easy Vision: ${failures.length} attachment(s) could not be processed${images.length ? `; ${images.length} image(s) remain available` : ""}. Do not infer the missing image contents.`,
        });
      return { ...message, content };
    }),
  );
}

export function stripImagesAfterFailure(
  messages: readonly Message[],
): Message[] {
  return messages.map((message) =>
    message.role !== "user" || !message.content.some(isImagePart)
      ? message
      : {
          ...message,
          content: message.content.map((part) =>
            isImagePart(part)
              ? {
                  type: "text" as const,
                  text: "Easy Vision: attachment processing failed. Reattach the image or check server logs.",
                  metadata: marker,
                }
              : part,
          ),
        },
  );
}
