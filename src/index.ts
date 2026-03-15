import type { Plugin } from "@opencode-ai/plugin";
import type { Message, Part, FilePart, TextPart } from "@opencode-ai/sdk";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Constants

const PLUGIN_NAME = "minimax-easy-vision";
const CONFIG_FILENAME = "opencode-minimax-easy-vision.json";
const TEMP_DIR_NAME = "opencode-minimax-vision";
const MAX_TOOL_NAME_LENGTH = 256;

const PROMPT_TEMPLATE_VARIABLES = ["{imageList}", "{imageCount}", "{toolName}", "{userText}"] as const;

const DEFAULT_MODEL_PATTERNS: readonly string[] = ["minimax/*", "*/abab*"];
const DEFAULT_IMAGE_ANALYSIS_TOOL = "mcp_minimax_understand_image";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

// Types

interface PluginConfig {
  models?: string[];
  imageAnalysisTool?: string;
  promptTemplate?: string;
}

interface SavedImage {
  path: string;
  mime: string;
  partId: string;
}

interface ModelInfo {
  providerID: string;
  modelID: string;
}

type Logger = (msg: string) => void;

// Plugin State

let pluginConfig: PluginConfig = {};

// Config: Path Resolution

function getUserConfigPath(): string {
  return join(homedir(), ".config", "opencode", CONFIG_FILENAME);
}

function getProjectConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
}

// Config: File Parsing

function parseModelsArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models = value.filter((m): m is string => typeof m === "string");
  return models.length > 0 ? models : undefined;
}

function parseImageAnalysisTool(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim() === "") return undefined;
  if (value.length > MAX_TOOL_NAME_LENGTH) return undefined;
  return value;
}

function parsePromptTemplate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (!PROMPT_TEMPLATE_VARIABLES.some((v) => trimmed.includes(v))) return undefined;
  return trimmed;
}

function parseConfigObject(raw: unknown): PluginConfig {
  if (!raw || typeof raw !== "object") return {};

  const obj = raw as Record<string, unknown>;
  return {
    models: parseModelsArray(obj.models),
    imageAnalysisTool: parseImageAnalysisTool(obj.imageAnalysisTool),
    promptTemplate: parsePromptTemplate(obj.promptTemplate),
  };
}

async function readConfigFile(
  configPath: string,
): Promise<PluginConfig | null> {
  if (!existsSync(configPath)) return null;

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    return parseConfigObject(parsed);
  } catch {
    return null;
  }
}

// Config: Precedence & Merging (project > user > defaults)

function selectWithPrecedence<T>(
  projectValue: T | undefined,
  userValue: T | undefined,
  defaultValue: T,
): { value: T; source: "project" | "user" | "default" } {
  if (projectValue !== undefined) {
    return { value: projectValue, source: "project" };
  }
  if (userValue !== undefined) {
    return { value: userValue, source: "user" };
  }
  return { value: defaultValue, source: "default" };
}

async function loadPluginConfig(directory: string, log: Logger): Promise<void> {
  const userConfig = await readConfigFile(getUserConfigPath());
  const projectConfig = await readConfigFile(getProjectConfigPath(directory));

  // Resolve models with precedence
  const modelsResult = selectWithPrecedence(
    projectConfig?.models,
    userConfig?.models,
    undefined,
  );
  if (modelsResult.source !== "default") {
    log(
      `Loaded models from ${modelsResult.source} config: ${modelsResult.value!.join(", ")}`,
    );
  } else {
    log(`Using default models: ${DEFAULT_MODEL_PATTERNS.join(", ")}`);
  }

  // Resolve imageAnalysisTool with precedence
  const toolResult = selectWithPrecedence(
    projectConfig?.imageAnalysisTool,
    userConfig?.imageAnalysisTool,
    undefined,
  );
  if (toolResult.source !== "default") {
    log(
      `Using imageAnalysisTool from ${toolResult.source} config: ${toolResult.value}`,
    );
  } else {
    log(`Using default imageAnalysisTool: ${DEFAULT_IMAGE_ANALYSIS_TOOL}`);
  }

  // Resolve promptTemplate with precedence
  const templateResult = selectWithPrecedence(
    projectConfig?.promptTemplate,
    userConfig?.promptTemplate,
    undefined,
  );
  if (templateResult.source !== "default") {
    log(`Using promptTemplate from ${templateResult.source} config (${templateResult.value!.length} chars)`);
  } else {
    log("Using default (hardcoded) injection prompt template");
  }

  pluginConfig = {
    models: modelsResult.value,
    imageAnalysisTool: toolResult.value,
    promptTemplate: templateResult.value,
  };
}

// Config: Accessors

function getConfiguredModels(): readonly string[] {
  return pluginConfig.models ?? DEFAULT_MODEL_PATTERNS;
}

function getImageAnalysisTool(): string {
  return pluginConfig.imageAnalysisTool ?? DEFAULT_IMAGE_ANALYSIS_TOOL;
}

function getPromptTemplate(): string | undefined {
  return pluginConfig.promptTemplate;
}

// Pattern Matching (supports wildcards: *, prefix*, *suffix, *contains*)

function matchesWildcardPattern(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();

  // Global wildcard
  if (p === "*") return true;

  // Contains: *text*
  if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
    return v.includes(p.slice(1, -1));
  }

  // Prefix: text*
  if (p.endsWith("*")) {
    return v.startsWith(p.slice(0, -1));
  }

  // Suffix: *text
  if (p.startsWith("*")) {
    return v.endsWith(p.slice(1));
  }

  // Exact match
  return v === p;
}

function matchesSinglePattern(pattern: string, model: ModelInfo): boolean {
  // Global wildcard matches everything
  if (pattern === "*") return true;

  const slashIndex = pattern.indexOf("/");

  // No slash: match against both provider and model
  if (slashIndex === -1) {
    return (
      matchesWildcardPattern(pattern, model.modelID) ||
      matchesWildcardPattern(pattern, model.providerID)
    );
  }

  // With slash: match provider/model separately
  const providerPattern = pattern.slice(0, slashIndex);
  const modelPattern = pattern.slice(slashIndex + 1);

  return (
    matchesWildcardPattern(providerPattern, model.providerID) &&
    matchesWildcardPattern(modelPattern, model.modelID)
  );
}

function modelMatchesAnyPattern(model: ModelInfo | undefined): boolean {
  if (!model) return false;

  const patterns = getConfiguredModels();
  return patterns.some((pattern) => matchesSinglePattern(pattern, model));
}

// Type Guards
//
// Messages in OpenCode contain "parts" - an array of different content types:
// - TextPart: The user's typed text
// - FilePart: Attached files (images, PDFs, etc.) with mime type and URL

function isImageFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const mime = (part as FilePart).mime?.toLowerCase() ?? "";
  return SUPPORTED_MIME_TYPES.has(mime);
}

function isTextPart(part: Part): part is TextPart {
  return part.type === "text";
}

// Image Processing: URL Handlers
//
// Images can arrive via different URL schemes:
// - file://  → Already on disk, just need the local path
// - data:    → Base64-encoded, must decode and save to temp file
// - http(s): → Remote URL, pass through for MCP tool to fetch directly

function handleFileUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): SavedImage | null {
  // Image is already saved locally; strip the file:// prefix to get the path
  const localPath = url.replace("file://", "");
  log(`Image already on disk: ${localPath}`);
  return { path: localPath, mime: filePart.mime, partId: filePart.id };
}

function parseBase64DataUrl(
  dataUrl: string,
): { mime: string; data: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  try {
    return { mime: match[1], data: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

async function handleDataUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): Promise<SavedImage | null> {
  // Pasted clipboard images arrive as base64 data URLs.
  // Decode and save to a temp file so the MCP tool can read it.
  const parsed = parseBase64DataUrl(url);
  if (!parsed) {
    log(`Failed to parse data URL for part ${filePart.id}`);
    return null;
  }

  try {
    const savedPath = await saveImageToTemp(parsed.data, parsed.mime);
    log(`Saved image to: ${savedPath}`);
    return { path: savedPath, mime: parsed.mime, partId: filePart.id };
  } catch (err) {
    log(`Failed to save image: ${err}`);
    return null;
  }
}

function handleHttpUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): SavedImage {
  // Remote URLs are passed directly to the MCP tool, which can fetch them itself.
  // This avoids unnecessary network requests and disk I/O.
  log(`Image is remote URL: ${url}`);
  return { path: url, mime: filePart.mime, partId: filePart.id };
}

// Image Processing: File Operations

function getExtensionForMime(mime: string): string {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? "png";
}

async function ensureTempDir(): Promise<string> {
  const dir = join(tmpdir(), TEMP_DIR_NAME);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function saveImageToTemp(data: Buffer, mime: string): Promise<string> {
  const tempDir = await ensureTempDir();
  const filename = `${randomUUID()}.${getExtensionForMime(mime)}`;
  const filepath = join(tempDir, filename);
  await writeFile(filepath, data);
  return filepath;
}

// Image Processing: Main Processor

async function processImagePart(
  filePart: FilePart,
  log: Logger,
): Promise<SavedImage | null> {
  const url = filePart.url;

  if (!url) {
    log(`Skipping image part ${filePart.id}: no URL`);
    return null;
  }

  if (url.startsWith("file://")) {
    return handleFileUrl(url, filePart, log);
  }

  if (url.startsWith("data:")) {
    return handleDataUrl(url, filePart, log);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return handleHttpUrl(url, filePart, log);
  }

  log(
    `Unsupported URL scheme for part ${filePart.id}: ${url.substring(0, 50)}...`,
  );
  return null;
}

async function extractImagesFromParts(
  parts: Part[],
  log: Logger,
): Promise<SavedImage[]> {
  const savedImages: SavedImage[] = [];

  for (const part of parts) {
    if (!isImageFilePart(part)) continue;

    const result = await processImagePart(part as FilePart, log);
    if (result) {
      savedImages.push(result);
    }
  }

  return savedImages;
}

// Prompt Generation
//
// Since the target model doesn't natively understand image attachments,
// we replace them with text instructions that tell the model to use an
// MCP tool (e.g., understand_image) with the file path or URL.
// The user's original text is preserved as "User's request: ...".

function applyPromptTemplate(
  template: string,
  vars: { imageList: string; imageCount: number; toolName: string; userText: string },
): string {
  return template
    .replace(/\{imageList\}/g, vars.imageList)
    .replace(/\{imageCount\}/g, String(vars.imageCount))
    .replace(/\{toolName\}/g, vars.toolName)
    .replace(/\{userText\}/g, vars.userText);
}

function generateInjectionPrompt(
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

// Message Transformation
//
// The transformation flow:
// 1. Find the last user message (most recent request)
// 2. Extract and save any images from its parts
// 3. Remove the image parts (they can't be sent to the model)
// 4. Replace/update the text part with injection instructions

function findLastUserMessage(
  messages: Array<{ info: Message; parts: Part[] }>,
): { message: { info: Message; parts: Part[] }; index: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info.role === "user") {
      return { message: messages[i], index: i };
    }
  }
  return null;
}

function getModelFromMessage(message: {
  info: Message;
}): ModelInfo | undefined {
  const info = message.info as { model?: ModelInfo };
  return info.model;
}

function removeProcessedImageParts(
  parts: Part[],
  processedIds: Set<string>,
): Part[] {
  // Remove image parts that were successfully processed; they've been converted
  // to file paths in the injection prompt and the model can't interpret raw images.
  return parts.filter(
    (part) => !(part.type === "file" && processedIds.has(part.id)),
  );
}

function updateOrCreateTextPart(
  message: { info: Message; parts: Part[] },
  newText: string,
): void {
  const textPartIndex = message.parts.findIndex(isTextPart);

  if (textPartIndex !== -1) {
    (message.parts[textPartIndex] as TextPart).text = newText;
  } else {
    const newTextPart: TextPart = {
      id: `transformed-${randomUUID()}`,
      sessionID: message.info.sessionID,
      messageID: message.info.id,
      type: "text",
      text: newText,
      synthetic: true,
    };
    message.parts.unshift(newTextPart);
  }
}

// Plugin Export

export const MinimaxEasyVisionPlugin: Plugin = async (input) => {
  const { client, directory } = input;

  const log: Logger = (msg) => {
    client.app
      .log({ body: { service: PLUGIN_NAME, level: "info", message: msg } })
      .catch(() => {});
  };

  await loadPluginConfig(directory, log);
  log("Plugin initialized");

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      const { messages } = output;

      const result = findLastUserMessage(messages);
      if (!result) return;

      const { message: lastUserMessage, index: lastUserIndex } = result;

      const model = getModelFromMessage(lastUserMessage);
      if (!modelMatchesAnyPattern(model)) return;

      log("Model matched, checking for images...");

      const hasImages = lastUserMessage.parts.some(isImageFilePart);
      if (!hasImages) return;

      log("Found images in message, processing...");

      const savedImages = await extractImagesFromParts(
        lastUserMessage.parts,
        log,
      );
      if (savedImages.length === 0) {
        log("No images were successfully saved");
        return;
      }

      log(`Saved ${savedImages.length} image(s), transforming message...`);

      const existingTextPart = lastUserMessage.parts.find(isTextPart);
      const userText = existingTextPart?.text ?? "";

      const transformedText = generateInjectionPrompt(
        savedImages,
        userText,
        getImageAnalysisTool(),
      );

      const processedIds = new Set(savedImages.map((img) => img.partId));
      lastUserMessage.parts = removeProcessedImageParts(
        lastUserMessage.parts,
        processedIds,
      );

      updateOrCreateTextPart(lastUserMessage, transformedText);
      messages[lastUserIndex] = lastUserMessage;

      log("Successfully injected image path instructions");
    },
  };
};

export default MinimaxEasyVisionPlugin;
