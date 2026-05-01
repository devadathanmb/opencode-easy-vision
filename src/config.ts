import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import stripJsonComments from "strip-json-comments";
import {
  CONFIG_FILENAME,
  CONFIG_FILENAME_JSONC,
  EXAMPLE_CONFIG_FILENAME,
  TEMP_DIR_NAME,
  MAX_TOOL_NAME_LENGTH,
  PROMPT_TEMPLATE_VARIABLES,
  DEFAULT_MODEL_PATTERNS,
  DEFAULT_IMAGE_ANALYSIS_TOOL,
  DEFAULT_CLEANUP_AFTER_HOURS,
} from "./constants.js";
import type { PluginConfig, Logger } from "./types.js";

let pluginConfig: PluginConfig = {};

// Path Resolution

function getUserConfigPath(): string {
  return join(homedir(), ".config", "opencode", CONFIG_FILENAME);
}

function getUserConfigPathJsonc(): string {
  return join(homedir(), ".config", "opencode", CONFIG_FILENAME_JSONC);
}

function getProjectConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
}

function getProjectConfigPathJsonc(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME_JSONC);
}

// File Parsing

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
  if (!PROMPT_TEMPLATE_VARIABLES.some((v) => trimmed.includes(v)))
    return undefined;
  return trimmed;
}

function parseTempDir(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseCleanupAfterHours(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function parseConfigObject(raw: unknown): PluginConfig {
  if (!raw || typeof raw !== "object") return {};

  const obj = raw as Record<string, unknown>;
  return {
    models: parseModelsArray(obj.models),
    imageAnalysisTool: parseImageAnalysisTool(obj.imageAnalysisTool),
    promptTemplate: parsePromptTemplate(obj.promptTemplate),
    tempDir: parseTempDir(obj.tempDir),
    cleanupAfterHours: parseCleanupAfterHours(obj.cleanupAfterHours),
  };
}

async function readConfigFile(
  configPath: string,
  onParseError?: (path: string) => void,
): Promise<PluginConfig | null> {
  if (!existsSync(configPath)) return null;

  try {
    const content = await readFile(configPath, "utf-8");
    const stripped = stripJsonComments(content, { trailingCommas: true });
    const parsed = JSON.parse(stripped) as unknown;
    return parseConfigObject(parsed);
  } catch {
    onParseError?.(configPath);
    return null;
  }
}

// Example Config Auto-Init

function getExampleConfigPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), "..", EXAMPLE_CONFIG_FILENAME);
}

async function createExampleConfigIfMissing(
  targetPath: string,
  log: Logger,
): Promise<void> {
  if (existsSync(targetPath)) {
    return;
  }

  const examplePath = getExampleConfigPath();
  if (!existsSync(examplePath)) {
    log("Example config file not found in package, skipping auto-init");
    return;
  }

  try {
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(examplePath, targetPath);
    log(`Created example config file at ${targetPath}`);
  } catch (err) {
    log(
      `Failed to create example config: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// Precedence & Merging (project > user > defaults)

type Resolution<T> = { value: T; source: "project" | "user" | "default" };

function selectWithPrecedence<T>(
  projectValue: T | undefined,
  userValue: T | undefined,
): Resolution<T | undefined> {
  if (projectValue !== undefined)
    return { value: projectValue, source: "project" };
  if (userValue !== undefined) return { value: userValue, source: "user" };
  return { value: undefined, source: "default" };
}

function logResolution<T>(
  fieldName: string,
  resolution: Resolution<T | undefined>,
  valueStr: string,
  defaultMsg: string | null,
  log: Logger,
): void {
  if (resolution.source !== "default") {
    log(`Using ${fieldName} from ${resolution.source} config: ${valueStr}`);
  } else if (defaultMsg !== null) {
    log(defaultMsg);
  }
}

export async function loadPluginConfig(
  directory: string,
  log: Logger,
): Promise<void> {
  const onParseError = (path: string) =>
    log(`WARN: Config file has invalid JSON and will be ignored: ${path}`);

  const userJson = getUserConfigPath();
  const userJsonc = getUserConfigPathJsonc();
  const projectJson = getProjectConfigPath(directory);
  const projectJsonc = getProjectConfigPathJsonc(directory);

  // Check existence before reading so we don't duplicate the existsSync calls
  // that readConfigFile already performs internally.
  const userConfigFileExists = existsSync(userJsonc) || existsSync(userJson);

  const [projectConfig, userConfig] = await Promise.all([
    readConfigFile(projectJsonc, onParseError).then(
      (r) => r ?? readConfigFile(projectJson, onParseError),
    ),
    readConfigFile(userJsonc, onParseError).then(
      (r) => r ?? readConfigFile(userJson, onParseError),
    ),
  ]);

  if (!userConfigFileExists) {
    await createExampleConfigIfMissing(userJsonc, log);
  }

  const models = selectWithPrecedence(
    projectConfig?.models,
    userConfig?.models,
  );
  logResolution(
    "models",
    models,
    models.value?.join(", ") ?? "",
    `Using default models: ${DEFAULT_MODEL_PATTERNS.join(", ")}`,
    log,
  );

  const imageAnalysisTool = selectWithPrecedence(
    projectConfig?.imageAnalysisTool,
    userConfig?.imageAnalysisTool,
  );
  logResolution(
    "imageAnalysisTool",
    imageAnalysisTool,
    imageAnalysisTool.value ?? "",
    `Using default imageAnalysisTool: ${DEFAULT_IMAGE_ANALYSIS_TOOL}`,
    log,
  );

  const promptTemplate = selectWithPrecedence(
    projectConfig?.promptTemplate,
    userConfig?.promptTemplate,
  );
  logResolution(
    "promptTemplate",
    promptTemplate,
    `${promptTemplate.value?.length ?? 0} chars`,
    "Using default (hardcoded) injection prompt template",
    log,
  );

  const tempDir = selectWithPrecedence(
    projectConfig?.tempDir,
    userConfig?.tempDir,
  );
  logResolution("tempDir", tempDir, tempDir.value ?? "", null, log);

  const cleanupAfterHours = selectWithPrecedence(
    projectConfig?.cleanupAfterHours,
    userConfig?.cleanupAfterHours,
  );
  logResolution(
    "cleanupAfterHours",
    cleanupAfterHours,
    String(cleanupAfterHours.value),
    `Using default cleanupAfterHours: ${DEFAULT_CLEANUP_AFTER_HOURS}`,
    log,
  );

  pluginConfig = {
    models: models.value,
    imageAnalysisTool: imageAnalysisTool.value,
    promptTemplate: promptTemplate.value,
    tempDir: tempDir.value,
    cleanupAfterHours: cleanupAfterHours.value,
  };
}

// Accessors

export function getConfiguredModels(): readonly string[] {
  return pluginConfig.models ?? DEFAULT_MODEL_PATTERNS;
}

export function getImageAnalysisTool(): string {
  return pluginConfig.imageAnalysisTool ?? DEFAULT_IMAGE_ANALYSIS_TOOL;
}

export function getPromptTemplate(): string | undefined {
  return pluginConfig.promptTemplate;
}

export function getTempDir(): string {
  return pluginConfig.tempDir ?? join(tmpdir(), TEMP_DIR_NAME);
}

export function getCleanupAfterHours(): number {
  return pluginConfig.cleanupAfterHours ?? DEFAULT_CLEANUP_AFTER_HOURS;
}
