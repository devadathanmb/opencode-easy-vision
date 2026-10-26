import type {
  ConfigAccessors,
  ImageAttachment,
  ImageResult,
  Logger,
} from "./types.js";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  rename,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIME_TO_EXTENSION, SUPPORTED_MIME_TYPES } from "./constants.js";
import { withFileLock } from "./file-lock.js";

export function normalizeMime(mime: string): string {
  return mime.split(";", 1)[0].trim().toLowerCase();
}

export function decodeBase64(value: string): Buffer {
  const text = value.replace(/\s/g, "");
  if (
    !text ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(text) ||
    text.length % 4 === 1 ||
    (text.includes("=") && text.length % 4 !== 0)
  ) {
    throw new Error("Malformed base64 image data");
  }
  const bytes = Buffer.from(text, "base64");
  if (
    !bytes.length ||
    bytes.toString("base64").replace(/=+$/, "") !== text.replace(/=+$/, "")
  ) {
    throw new Error("Malformed base64 image data");
  }
  return bytes;
}

// The name is a content hash, but the directory may be shared (e.g. /tmp on
// Linux): only trust a regular file we own with the expected size. Anything else,
// including a planted symlink, is atomically replaced by the rename below.
async function isReusable(path: string, size: number): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return (
      stats.isFile() &&
      stats.size === size &&
      stats.uid === (process.getuid?.() ?? stats.uid)
    );
  } catch {
    return false;
  }
}

async function persist(
  bytes: Uint8Array,
  mime: string,
  directory: string,
): Promise<string> {
  if (!bytes.length) throw new Error("Empty image data");
  const hash = createHash("sha256")
    .update(mime)
    .update("\0")
    .update(bytes)
    .digest("hex");
  const path = join(directory, `${hash}.${MIME_TO_EXTENSION[mime]}`);
  await withFileLock(path, async () => {
    // Every request replays the whole history, so most saves hit an existing file.
    if (await isReusable(path, bytes.length)) {
      // Refresh mtime so startup cleanup never deletes a file that is in use.
      const now = new Date();
      await utimes(path, now, now);
      return;
    }
    await mkdir(directory, { recursive: true });
    const staging = `${path}.writing-${randomUUID()}`;
    try {
      await writeFile(staging, bytes, { mode: 0o600 });
      await rename(staging, path);
    } finally {
      await unlink(staging).catch(() => {});
    }
  });
  return path;
}

export function createImageProcessor(config: ConfigAccessors, log: Logger) {
  return async (attachment: ImageAttachment): Promise<ImageResult> => {
    const mime = normalizeMime(attachment.mime);
    try {
      if (!SUPPORTED_MIME_TYPES.has(mime))
        throw new Error(`Unsupported image format (${mime})`);
      const source = attachment.source;
      let path: string;
      switch (source.type) {
        case "bytes":
          path = await persist(source.data, mime, config.getTempDir());
          break;
        case "base64":
          path = await persist(
            decodeBase64(source.data),
            mime,
            config.getTempDir(),
          );
          break;
        case "ref":
          throw new Error(
            "Provider image reference cannot be resolved; attach the original image instead",
          );
        case "url": {
          if (attachment.requiresHeaders)
            throw new Error(
              "Image URL requires private headers; attach the image bytes instead",
            );
          if (source.expiresAt !== undefined && source.expiresAt <= Date.now())
            throw new Error("Image URL has expired; attach the image again");
          const url = new URL(source.url);
          if (url.protocol === "file:") {
            path = fileURLToPath(url);
            await access(path);
          } else if (url.protocol === "http:" || url.protocol === "https:") {
            path = source.url;
          } else if (url.protocol === "data:") {
            const match = source.url.match(/^data:([^;,]+);base64,([\s\S]*)$/i);
            if (!match || normalizeMime(match[1]) !== mime)
              throw new Error("Malformed or mismatched image data URL");
            path = await persist(
              decodeBase64(match[2]),
              mime,
              config.getTempDir(),
            );
          } else {
            throw new Error("Unsupported image URL scheme");
          }
          break;
        }
      }
      return { ok: true, image: { path, mime } };
    } catch (error) {
      // Never log payloads, source URLs, private headers, or I/O error details.
      const reason =
        error instanceof Error && !("code" in error)
          ? error.message
          : "Could not save/read the image; check the server temp directory and permissions";
      log(`Image processing failed: ${reason}`);
      return { ok: false, reason };
    }
  };
}
