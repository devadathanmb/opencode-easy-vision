export const PLUGIN_NAME = "minimax-easy-vision";
export const CONFIG_FILENAME = "opencode-minimax-easy-vision.json";
export const CONFIG_FILENAME_JSONC = "opencode-minimax-easy-vision.jsonc";
export const EXAMPLE_CONFIG_FILENAME = "opencode-minimax-easy-vision.example.jsonc";
export const TEMP_DIR_NAME = "opencode-minimax-vision";
export const MAX_TOOL_NAME_LENGTH = 256;

export const PROMPT_TEMPLATE_VARIABLES = [
  "{imageList}",
  "{imageCount}",
  "{toolName}",
  "{userText}",
] as const;

export const DEFAULT_MODEL_PATTERNS: readonly string[] = [
  "minimax/*",
  "minimax-cn/*",
  "minimax-coding-plan/*",
  "minimax-cn-coding-plan/*",
  // "coding-plan" is being renamed to "token-plan" in opencode
  // https://github.com/anomalyco/opencode/pull/21095
  // Include token-plan variants proactively for when the rename lands in models.dev
  "minimax-token-plan/*",
  "minimax-cn-token-plan/*",
];
export const DEFAULT_IMAGE_ANALYSIS_TOOL = "mcp_minimax_understand_image";
export const DEFAULT_CLEANUP_AFTER_HOURS = 24;

export const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};
