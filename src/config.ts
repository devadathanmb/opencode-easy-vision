import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import stripJsonComments from "strip-json-comments";
import {
  CONFIG_FILENAME,
  CONFIG_FILENAME_JSONC,
  LEGACY_CONFIG_FILENAME,
  LEGACY_CONFIG_FILENAME_JSONC,
  EXAMPLE_CONFIG_FILENAME,
  TEMP_DIR_NAME,
  LEGACY_TEMP_DIR_NAME,
  MAX_TOOL_NAME_LENGTH,
  PROMPT_TEMPLATE_VARIABLES,
  DEFAULT_MODEL_PATTERNS,
  DEFAULT_IMAGE_ANALYSIS_TOOL,
  DEFAULT_CLEANUP_AFTER_HOURS,
} from "./constants.js";
import type { PluginConfig, Logger } from "./types.js";

let pluginConfig: PluginConfig = {};

// Path Resolution
function getUserConfigPath(filename: string): string {
  return join(homedir(), ".config", "opencode", filename);
}

function getProjectConfigPath(directory: string, filename: string): string {
  return join(directory, ".opencode", filename);
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
  // Reject templates with no recognized variables — without {imageList} or {toolName},
  // the template can't convey image paths or the tool to call, making it useless.
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

type LoadedConfig = {
  config: PluginConfig;
  path: string;
};

type ConfigPaths = {
  jsonc: string;
  json: string;
};

async function readConfigPair(
  paths: ConfigPaths,
  onParseError: (path: string) => void,
): Promise<LoadedConfig | null> {
  const jsoncConfig = await readConfigFile(paths.jsonc, onParseError);
  if (jsoncConfig !== null) return { config: jsoncConfig, path: paths.jsonc };

  const jsonConfig = await readConfigFile(paths.json, onParseError);
  return jsonConfig === null ? null : { config: jsonConfig, path: paths.json };
}

function configExists(paths: ConfigPaths): boolean {
  return existsSync(paths.jsonc) || existsSync(paths.json);
}

async function loadConfigAtLevel(
  level: "project" | "user",
  currentPaths: ConfigPaths,
  legacyPaths: ConfigPaths,
  onParseError: (path: string) => void,
  log: Logger,
): Promise<LoadedConfig | null> {
  const current = await readConfigPair(currentPaths, onParseError);
  if (current !== null) {
    if (configExists(legacyPaths)) {
      log(
        `Ignoring alternate ${level} config because ${current.path} is present`,
      );
    }
    return current;
  }

  const legacy = await readConfigPair(legacyPaths, onParseError);
  if (legacy !== null) {
    log(`Using ${level} config at ${legacy.path}`);
  }
  return legacy;
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

// Config value selection (Precedence: project > user > defaults)
type ConfigSelection<T> = {
  value: T;
  source: "project" | "user" | "default";
};

function selectConfigValue<T>(
  projectValue: T | undefined,
  userValue: T | undefined,
): ConfigSelection<T | undefined> {
  if (projectValue !== undefined)
    return { value: projectValue, source: "project" };
  if (userValue !== undefined) return { value: userValue, source: "user" };
  return { value: undefined, source: "default" };
}

export async function loadPluginConfig(
  directory: string,
  log: Logger,
): Promise<void> {
  const onParseError = (path: string) =>
    log(`WARN: Config file has invalid JSON and will be ignored: ${path}`);

  function logSelected<T>(
    fieldName: string,
    selection: ConfigSelection<T | undefined>,
    selectedValueLabel: string,
    defaultMessage: string | null,
  ): void {
    if (selection.source !== "default") {
      log(
        `Using ${fieldName} from ${selection.source} config: ${selectedValueLabel}`,
      );
    } else if (defaultMessage !== null) {
      log(defaultMessage);
    }
  }

  const userPaths = {
    jsonc: getUserConfigPath(CONFIG_FILENAME_JSONC),
    json: getUserConfigPath(CONFIG_FILENAME),
  };
  const legacyUserPaths = {
    jsonc: getUserConfigPath(LEGACY_CONFIG_FILENAME_JSONC),
    json: getUserConfigPath(LEGACY_CONFIG_FILENAME),
  };
  const projectPaths = {
    jsonc: getProjectConfigPath(directory, CONFIG_FILENAME_JSONC),
    json: getProjectConfigPath(directory, CONFIG_FILENAME),
  };
  const legacyProjectPaths = {
    jsonc: getProjectConfigPath(directory, LEGACY_CONFIG_FILENAME_JSONC),
    json: getProjectConfigPath(directory, LEGACY_CONFIG_FILENAME),
  };

  const [projectConfig, userConfig] = await Promise.all([
    loadConfigAtLevel(
      "project",
      projectPaths,
      legacyProjectPaths,
      onParseError,
      log,
    ),
    loadConfigAtLevel("user", userPaths, legacyUserPaths, onParseError, log),
  ]);

  if (!configExists(userPaths) && !configExists(legacyUserPaths)) {
    await createExampleConfigIfMissing(userPaths.jsonc, log);
  }

  const models = selectConfigValue(
    projectConfig?.config.models,
    userConfig?.config.models,
  );
  logSelected(
    "models",
    models,
    models.value?.join(", ") ?? "",
    `Using default models: ${DEFAULT_MODEL_PATTERNS.join(", ")}`,
  );

  const imageAnalysisTool = selectConfigValue(
    projectConfig?.config.imageAnalysisTool,
    userConfig?.config.imageAnalysisTool,
  );
  logSelected(
    "imageAnalysisTool",
    imageAnalysisTool,
    imageAnalysisTool.value ?? "",
    `Using default imageAnalysisTool: ${DEFAULT_IMAGE_ANALYSIS_TOOL}`,
  );

  const promptTemplate = selectConfigValue(
    projectConfig?.config.promptTemplate,
    userConfig?.config.promptTemplate,
  );
  logSelected(
    "promptTemplate",
    promptTemplate,
    `${promptTemplate.value?.length ?? 0} chars`,
    "Using default (hardcoded) injection prompt template",
  );

  const tempDir = selectConfigValue(
    projectConfig?.config.tempDir,
    userConfig?.config.tempDir,
  );
  logSelected("tempDir", tempDir, tempDir.value ?? "", null);

  const cleanupAfterHours = selectConfigValue(
    projectConfig?.config.cleanupAfterHours,
    userConfig?.config.cleanupAfterHours,
  );
  logSelected(
    "cleanupAfterHours",
    cleanupAfterHours,
    String(cleanupAfterHours.value),
    `Using default cleanupAfterHours: ${DEFAULT_CLEANUP_AFTER_HOURS}`,
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

export function getTempDirsForCleanup(): readonly string[] {
  return [
    ...new Set([
      getTempDir(),
      join(tmpdir(), TEMP_DIR_NAME),
      join(tmpdir(), LEGACY_TEMP_DIR_NAME),
    ]),
  ];
}

export function getCleanupAfterHours(): number {
  return pluginConfig.cleanupAfterHours ?? DEFAULT_CLEANUP_AFTER_HOURS;
}
