export interface PluginConfig {
  models?: string[];
  imageAnalysisTool?: string;
  promptTemplate?: string;
  tempDir?: string;
  cleanupAfterHours?: number;
}

export interface SavedImage {
  path: string;
  mime: string;
  partId: string; // ID of the original FilePart, used to remove it from the message after injection
}

export interface ModelInfo {
  providerID: string;
  modelID: string;
}

// Logger writes to the app's structured log (silent to the user).
// Notifier surfaces visible toast messages for errors the user should act on.
export type Logger = (msg: string) => void;

export type Notifier = {
  warn: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
};
