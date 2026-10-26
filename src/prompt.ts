import type { ConfigAccessors, SavedImage, ToolRoute } from "./types.js";
import {
  DEFAULT_PROMPT_TEMPLATE_MULTIPLE,
  DEFAULT_PROMPT_TEMPLATE_SINGLE,
} from "./constants.js";

export function createPromptGenerator(config: ConfigAccessors) {
  return (
    images: readonly SavedImage[],
    userText: string,
    route: ToolRoute,
  ): string => {
    const toolName = config.getImageAnalysisTool();
    const imageList = images
      .map((image, index) => `- Image ${index + 1}: ${image.path}`)
      .join("\n");
    if (route === "unavailable") {
      return `Saved image context:\n${imageList}\nEasy Vision: ${toolName} is not available for this request. Connect the vision MCP and allow its tool (or execute for Code Mode). Do not claim to have analyzed the images.`;
    }
    const template =
      config.getPromptTemplate() ??
      (images.length === 1
        ? DEFAULT_PROMPT_TEMPLATE_SINGLE
        : DEFAULT_PROMPT_TEMPLATE_MULTIPLE);
    const variables: Record<string, string> = {
      imageList,
      imageCount: String(images.length),
      toolName,
      userText: userText || "(analyze the image)",
    };
    const prompt = template.replace(
      /\{(imageList|imageCount|toolName|userText)\}/g,
      (_, name: string) => variables[name],
    );
    const routing =
      route === "codemode"
        ? `\nThis MCP tool is exposed through Code Mode, not as a direct function. Use execute and its search/catalog facilities to discover the exact ${toolName} tool and signature, then invoke it through the returned tools catalog. Do not guess the namespace or bypass permissions.`
        : "";
    return `${prompt}${routing}\nReuse any image analysis already present in this conversation; do not repeat completed analysis.`;
  };
}
