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
  partId: string;
}

export interface ModelInfo {
  providerID: string;
  modelID: string;
}

export type Logger = (msg: string) => void;

export type Notifier = {
  warn: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
};
