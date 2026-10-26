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

export type ImageSource =
  | { type: "bytes"; data: Uint8Array; mediaType: string }
  | { type: "base64"; data: string; mediaType: string }
  | { type: "url"; url: string; mediaType?: string; expiresAt?: number }
  | { type: "ref"; provider: string; id: string; mediaType?: string };

export interface ImageAttachment {
  mime: string;
  source: ImageSource;
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

export interface ModelInfo {
  providerID: string;
  modelID: string;
}

// Server logging is UI-independent; request text also carries actionable failures.
export type Logger = (msg: string) => void;

export type Notifier = {
  warn: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
};
