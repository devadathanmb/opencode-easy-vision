// Plugin metadata
export const PLUGIN_NAME = "easy-vision";

// Config filenames
export const CONFIG_FILENAME = "opencode-easy-vision.json";
export const CONFIG_FILENAME_JSONC = "opencode-easy-vision.jsonc";
export const LEGACY_CONFIG_FILENAME = "opencode-minimax-easy-vision.json";
export const LEGACY_CONFIG_FILENAME_JSONC =
  "opencode-minimax-easy-vision.jsonc";
export const EXAMPLE_CONFIG_FILENAME = "opencode-easy-vision.example.jsonc";

// Directories and limits
export const TEMP_DIR_NAME = "opencode-easy-vision";
export const LEGACY_TEMP_DIR_NAME = "opencode-minimax-vision";
// Treat tool names longer than this as a misconfiguration — MCP tool names have a defined upper bound.
export const MAX_TOOL_NAME_LENGTH = 256;

// Defaults
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

// MIME types — OpenCode normalizes all JPEG variants to image/jpeg,
// so image/jpg (non-standard, not in IANA registry) is not needed.
export const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set(
  Object.keys(MIME_TO_EXTENSION),
);

// Prompt templates
export const PROMPT_TEMPLATE_VARIABLES = [
  "{imageList}",
  "{imageCount}",
  "{toolName}",
  "{userText}",
] as const;

export const DEFAULT_PROMPT_TEMPLATE_SINGLE = `The user has shared an image. The image is saved at:
{imageList}

Use the \`{toolName}\` tool to analyze this image.

User's request: {userText}`;

export const DEFAULT_PROMPT_TEMPLATE_MULTIPLE = `The user has shared {imageCount} images. The images are saved at:
{imageList}

Use the \`{toolName}\` tool to analyze each image.

User's request: {userText}`;
