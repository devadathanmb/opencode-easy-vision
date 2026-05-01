import { join } from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getTempDir, getCleanupAfterHours } from "./config.js";
import type { Logger } from "./types.js";

export async function cleanupOldTempFiles(log: Logger): Promise<void> {
  const dir = getTempDir();
  if (!existsSync(dir)) return;

  const cutoffMs = getCleanupAfterHours() * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;

  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const filepath = join(dir, entry);
      try {
        const stats = await stat(filepath);
        if (now - stats.mtimeMs > cutoffMs) {
          await unlink(filepath);
          deleted++;
        }
      } catch {
        // skip files that can't be stat'd or deleted
      }
    }
    if (deleted > 0) log(`Cleaned up ${deleted} old temp file(s) from ${dir}`);
  } catch {
    // if readdir fails (e.g. permissions), skip cleanup silently
  }
}
