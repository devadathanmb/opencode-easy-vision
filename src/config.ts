import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  CONFIG_FILENAME,
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

function getProjectConfigPath(directory: string): string {
  return join(directory, ".opencode", CONFIG_FILENAME);
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
    const parsed = JSON.parse(content) as unknown;
    return parseConfigObject(parsed);
  } catch {
    onParseError?.(configPath);
    return null;
  }
}

// Precedence & Merging (project > user > defaults)

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

export async function loadPluginConfig(
  directory: string,
  log: Logger,
): Promise<void> {
  const onParseError = (path: string) =>
    log(
      `WARN: Config file has invalid JSON and will be ignored: ${path}`,
    );

  const userConfig = await readConfigFile(getUserConfigPath(), onParseError);
  const projectConfig = await readConfigFile(
    getProjectConfigPath(directory),
    onParseError,
  );

  const modelsResult = selectWithPrecedence(
    projectConfig?.models,
    userConfig?.models,
    undefined,
  );
  if (modelsResult.source !== "default") {
    log(
      `Loaded models from ${modelsResult.source} config: ${modelsResult.value?.join(", ")}`,
    );
  } else {
    log(`Using default models: ${DEFAULT_MODEL_PATTERNS.join(", ")}`);
  }

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

  const templateResult = selectWithPrecedence(
    projectConfig?.promptTemplate,
    userConfig?.promptTemplate,
    undefined,
  );
  if (templateResult.source !== "default") {
    log(
      `Using promptTemplate from ${templateResult.source} config (${templateResult.value?.length ?? 0} chars)`,
    );
  } else {
    log("Using default (hardcoded) injection prompt template");
  }

  const tempDirResult = selectWithPrecedence(
    projectConfig?.tempDir,
    userConfig?.tempDir,
    undefined,
  );
  if (tempDirResult.source !== "default") {
    log(
      `Using tempDir from ${tempDirResult.source} config: ${tempDirResult.value}`,
    );
  }

  const cleanupResult = selectWithPrecedence(
    projectConfig?.cleanupAfterHours,
    userConfig?.cleanupAfterHours,
    undefined,
  );
  if (cleanupResult.source !== "default") {
    log(
      `Using cleanupAfterHours from ${cleanupResult.source} config: ${cleanupResult.value}`,
    );
  } else {
    log(`Using default cleanupAfterHours: ${DEFAULT_CLEANUP_AFTER_HOURS}`);
  }

  pluginConfig = {
    models: modelsResult.value,
    imageAnalysisTool: toolResult.value,
    promptTemplate: templateResult.value,
    tempDir: tempDirResult.value,
    cleanupAfterHours: cleanupResult.value,
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
