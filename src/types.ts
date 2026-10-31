import type { Media } from "@opencode/ai";

export interface PluginConfig {
  models?: string[];
  imageAnalysisTool?: string;
  promptTemplate?: string;
  tempDir?: string;
  cleanupAfterHours?: number;
  disableCodeMode?: boolean;
}

export interface SavedImage {
  path: string;
  mime: string;
}

export interface ImageAttachment {
  mime: string;
  source: Media.Source;
  requiresHeaders?: boolean;
}

export type ImageResult =
  | { ok: true; image: SavedImage }
  | { ok: false; reason: string };

export interface ConfigAccessors {
  getConfiguredModels(): readonly string[];
  getImageAnalysisTool(): string;
  getPromptTemplate(): string | undefined;
  getTempDir(): string;
  getTempDirsForCleanup(): readonly string[];
  getCleanupAfterHours(): number;
  getDisableCodeMode(): boolean;
}

export type ToolRoute = "direct" | "codemode" | "unavailable";

// The fields of OpenCode's tool registry entries that routing needs.
export interface RegisteredTool {
  id: string;
  options?: { codemode?: boolean };
}

export interface ModelInfo {
  providerID: string;
  modelID: string;
}

// Both go to OpenCode's log; the plugin has no UI of its own.
export type Logger = (message: string) => void;

export interface Notifier {
  warn: Logger;
}
