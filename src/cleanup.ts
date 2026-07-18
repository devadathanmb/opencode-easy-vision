import { join } from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getTempDirsForCleanup, getCleanupAfterHours } from "./config.js";
import type { Logger } from "./types.js";

// Matches only UUID-named image files that this plugin wrote, so we never
// accidentally delete unrelated files that happen to land in the same directory.
const PLUGIN_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

async function tryDeleteIfExpired(
  filepath: string,
  now: number,
  cutoffMs: number,
): Promise<boolean> {
  try {
    const stats = await stat(filepath);
    // mtimeMs: writeFile updates mtime, so it reliably tracks when the plugin wrote the file.
    // birthtime is unreliable on some filesystems (e.g., copying a file preserves the original birthtime).
    if (now - stats.mtimeMs > cutoffMs) {
      await unlink(filepath);
      return true;
    }
  } catch {
    // skip files that can't be stat'd or deleted
  }
  return false;
}

async function cleanupTempDir(
  dir: string,
  now: number,
  cutoffMs: number,
  log: Logger,
): Promise<void> {
  if (!existsSync(dir)) return;

  try {
    const entries = await readdir(dir);
    const candidates = entries
      .filter((e) => PLUGIN_FILE_PATTERN.test(e))
      .map((e) => join(dir, e));

    const results = await Promise.all(
      candidates.map((filepath) => tryDeleteIfExpired(filepath, now, cutoffMs)),
    );
    const deleted = results.filter(Boolean).length;
    if (deleted > 0) log(`Cleaned up ${deleted} old temp file(s) from ${dir}`);
  } catch {
    // if readdir fails (e.g. permissions), skip cleanup silently
  }
}

export async function cleanupOldTempFiles(log: Logger): Promise<void> {
  const cutoffMs = getCleanupAfterHours() * 60 * 60 * 1000;
  const now = Date.now();

  await Promise.all(
    getTempDirsForCleanup().map((dir) =>
      cleanupTempDir(dir, now, cutoffMs, log),
    ),
  );
}
