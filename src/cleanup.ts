import { join } from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getTempDir, getCleanupAfterHours } from "./config.js";
import type { Logger } from "./types.js";

const PLUGIN_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;

async function tryDeleteIfExpired(
  filepath: string,
  now: number,
  cutoffMs: number,
): Promise<boolean> {
  try {
    const stats = await stat(filepath);
    if (now - stats.mtimeMs > cutoffMs) {
      await unlink(filepath);
      return true;
    }
  } catch {
    // skip files that can't be stat'd or deleted
  }
  return false;
}

export async function cleanupOldTempFiles(log: Logger): Promise<void> {
  const dir = getTempDir();
  if (!existsSync(dir)) return;

  const cutoffMs = getCleanupAfterHours() * 60 * 60 * 1000;
  const now = Date.now();

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
