import { readdir, readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupOldTempFiles } from "../src/cleanup.js";
import { createConfigStore } from "../src/config.js";
import { PNG_BYTES, fixture, recorder, silent, tempDir } from "./helpers.js";

const HASH = "a".repeat(64);
const HOUR = 60 * 60 * 1000;

async function writeAged(path: string, ageMs: number) {
  await writeFile(path, PNG_BYTES);
  const when = new Date(Date.now() - ageMs);
  await utimes(path, when, when);
}

function storeFor(dir: string, cleanupAfterHours = 24) {
  return {
    ...createConfigStore({ tempDir: dir, cleanupAfterHours }),
    getTempDirsForCleanup: () => [dir],
  };
}

describe("cleanupOldTempFiles", () => {
  it("deletes only expired plugin-owned files", async () => {
    const dir = await tempDir();
    await writeAged(join(dir, `${HASH}.png`), 25 * HOUR);
    await writeAged(join(dir, `${"b".repeat(64)}.jpg`), 25 * HOUR);
    await writeAged(join(dir, `${"c".repeat(64)}.webp`), 1 * HOUR);
    await writeAged(join(dir, "user-owned.png"), 25 * HOUR);
    await writeAged(join(dir, `${HASH}.gif`), 25 * HOUR);
    await writeAged(
      join(dir, "01234567-89ab-cdef-0123-456789abcdef.png"),
      25 * HOUR,
    );
    const { log, messages } = recorder();
    await cleanupOldTempFiles(storeFor(dir), log);
    expect((await readdir(dir)).sort()).toEqual(
      [
        `${"c".repeat(64)}.webp`,
        "user-owned.png",
        `${HASH}.gif`,
        "01234567-89ab-cdef-0123-456789abcdef.png",
      ].sort(),
    );
    expect(messages.info).toEqual([
      `Cleaned up 2 old temp file(s) from ${dir}`,
    ]);
  });

  it("honors cleanupAfterHours", async () => {
    const dir = await tempDir();
    await writeAged(join(dir, `${HASH}.png`), 3 * HOUR);
    await cleanupOldTempFiles(storeFor(dir, 4), silent);
    expect(await readdir(dir)).toHaveLength(1);
    await cleanupOldTempFiles(storeFor(dir, 2), silent);
    expect(await readdir(dir)).toHaveLength(0);
  });

  it("is silent when nothing was deleted or the directory is missing", async () => {
    const dir = await tempDir();
    const { log, messages } = recorder();
    await cleanupOldTempFiles(storeFor(dir), log);
    await cleanupOldTempFiles(storeFor(join(dir, "missing")), log);
    expect(messages.info).toEqual([]);
  });

  it("keeps a file that a request reused after it expired", async () => {
    const f = await fixture();
    const attachment = {
      mime: "image/png",
      source: {
        type: "bytes" as const,
        data: PNG_BYTES,
        mediaType: "image/png",
      },
    };
    const saved = await f.process(attachment);
    if (!saved.ok) throw new Error(saved.reason);
    const old = new Date(Date.now() - 25 * HOUR);
    await utimes(saved.image.path, old, old);
    await f.process(attachment);
    await cleanupOldTempFiles(storeFor(f.tempDir), silent);
    expect(await readdir(f.tempDir)).toEqual([
      saved.image.path.split("/").pop(),
    ]);
  });

  it("does not delete a file that is being written concurrently", async () => {
    const f = await fixture();
    const attachment = {
      mime: "image/png",
      source: {
        type: "bytes" as const,
        data: PNG_BYTES,
        mediaType: "image/png",
      },
    };
    const first = await f.process(attachment);
    if (!first.ok) throw new Error(first.reason);
    const old = new Date(Date.now() - 25 * HOUR);
    await utimes(first.image.path, old, old);
    // Whichever runs first under the per-path lock, the file must survive:
    // cleanup-then-save recreates it, save-then-cleanup refreshes its mtime.
    await Promise.all([
      cleanupOldTempFiles(storeFor(f.tempDir), silent),
      f.process(attachment),
    ]);
    expect(await readFile(first.image.path)).toEqual(PNG_BYTES);
  });
});
