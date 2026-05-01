import type { Part, FilePart } from "@opencode-ai/sdk";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SUPPORTED_MIME_TYPES, MIME_TO_EXTENSION } from "./constants.js";
import { getTempDir } from "./config.js";
import type { SavedImage, Logger, Notifier } from "./types.js";

// Type Guards
//
// Messages in OpenCode contain "parts" - an array of different content types:
// - TextPart: The user's typed text
// - FilePart: Attached files (images, PDFs, etc.) with mime type and URL

export function isImageFilePart(part: Part): part is FilePart {
  if (part.type !== "file") return false;
  const mime = (part as FilePart).mime?.toLowerCase() ?? "";
  return SUPPORTED_MIME_TYPES.has(mime);
}

export function isTextPart(part: Part): part is import("@opencode-ai/sdk").TextPart {
  return part.type === "text";
}

// URL Handlers
//
// Images can arrive via different URL schemes:
// - file://  → Already on disk, just need the local path
// - data:    → Base64-encoded, must decode and save to temp file
// - http(s): → Remote URL, pass through for MCP tool to fetch directly

function handleFileUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): SavedImage {
  const localPath = fileURLToPath(url);
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
  notify: Notifier,
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
    const msg = err instanceof Error ? err.message : String(err);
    log(`Failed to save image: ${msg}`);
    notify.error(`Could not save image to disk: ${msg}`, "Easy Vision");
    return null;
  }
}

function handleHttpUrl(
  url: string,
  filePart: FilePart,
  log: Logger,
): SavedImage {
  // Remote URLs are passed directly to the MCP tool, which can fetch them itself.
  log(`Image is remote URL: ${url}`);
  return { path: url, mime: filePart.mime, partId: filePart.id };
}

// File Operations

function getExtensionForMime(mime: string): string {
  return MIME_TO_EXTENSION[mime.toLowerCase()] ?? "png";
}

async function ensureTempDir(): Promise<string> {
  const dir = getTempDir();
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

// Main Processor

async function processImagePart(
  filePart: FilePart,
  log: Logger,
  notify: Notifier,
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
    return handleDataUrl(url, filePart, log, notify);
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return handleHttpUrl(url, filePart, log);
  }

  log(`Unsupported URL scheme for part ${filePart.id}: ${url.slice(0, 50)}...`);
  return null;
}

export async function extractImagesFromParts(
  parts: Part[],
  log: Logger,
  notify: Notifier,
): Promise<SavedImage[]> {
  const savedImages: SavedImage[] = [];

  for (const part of parts) {
    if (!isImageFilePart(part)) continue;

    const result = await processImagePart(part, log, notify);
    if (result) {
      savedImages.push(result);
    }
  }

  return savedImages;
}
