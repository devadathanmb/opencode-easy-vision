import { getPromptTemplate } from "./config.js";
import type { SavedImage } from "./types.js";

// Since the target model doesn't natively understand image attachments,
// we replace them with text instructions that tell the model to use an
// MCP tool (e.g., understand_image) with the file path or URL.
// The user's original text is preserved as "User's request: ...".

function applyPromptTemplate(
  template: string,
  vars: {
    imageList: string;
    imageCount: number;
    toolName: string;
    userText: string;
  },
): string {
  return template
    .replace(/\{imageList\}/g, vars.imageList)
    .replace(/\{imageCount\}/g, String(vars.imageCount))
    .replace(/\{toolName\}/g, vars.toolName)
    .replace(/\{userText\}/g, vars.userText);
}

export function generateInjectionPrompt(
  images: SavedImage[],
  userText: string,
  toolName: string,
): string {
  if (images.length === 0) return userText;

  const imageList = images
    .map((img, idx) => `- Image ${idx + 1}: ${img.path}`)
    .join("\n");

  const customTemplate = getPromptTemplate();
  if (customTemplate !== undefined) {
    return applyPromptTemplate(customTemplate, {
      imageList,
      imageCount: images.length,
      toolName,
      userText,
    });
  }

  const isSingle = images.length === 1;
  const imageCountText = isSingle ? "an image" : `${images.length} images`;
  const imagePlural = isSingle ? "image is" : "images are";
  const analyzeText = isSingle ? "this image" : "each image";

  return `The user has shared ${imageCountText}. The ${imagePlural} saved at:
${imageList}

Use the \`${toolName}\` tool to analyze ${analyzeText}.

User's request: ${userText || "(analyze the image)"}`;
}
