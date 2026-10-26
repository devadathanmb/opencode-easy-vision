import type { ImageAttachment, ImageResult } from "../src/types.js";
import {
  lstat,
  readdir,
  readFile,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createConfigStore } from "../src/config.js";
import {
  createImageProcessor,
  decodeBase64,
  normalizeMime,
} from "../src/images.js";
import { PNG_BYTES, fixture, recorder } from "./helpers.js";

const bytesSource = (
  data: Uint8Array = PNG_BYTES,
  mediaType = "image/png",
): ImageAttachment => ({
  mime: mediaType,
  source: { type: "bytes", data, mediaType },
});

function expectSaved(result: ImageResult): string {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
  return result.image.path;
}

function expectFailure(result: ImageResult): string {
  if (result.ok) throw new Error(`expected failure, got ${result.image.path}`);
  return result.reason;
}

describe("normalizeMime", () => {
  it("lowercases and drops parameters", () => {
    expect(normalizeMime(" IMAGE/PNG; charset=binary")).toBe("image/png");
  });
});

describe("decodeBase64", () => {
  it("decodes padded, unpadded and whitespace-wrapped input", () => {
    const encoded = PNG_BYTES.toString("base64");
    expect(decodeBase64(encoded)).toEqual(PNG_BYTES);
    expect(decodeBase64(encoded.replace(/=+$/, ""))).toEqual(PNG_BYTES);
    expect(decodeBase64(`${encoded.slice(0, 4)}\n${encoded.slice(4)}`)).toEqual(
      PNG_BYTES,
    );
  });

  it.each(["", "%%%", "abcde", "ab=c", "a==="])("rejects %j", (value) => {
    expect(() => decodeBase64(value)).toThrow("Malformed base64 image data");
  });
});

describe("createImageProcessor", () => {
  it("saves bytes, base64 and data URLs to one content-hashed file", async () => {
    const f = await fixture();
    const encoded = PNG_BYTES.toString("base64");
    const results = await Promise.all(
      [
        bytesSource(),
        {
          mime: "IMAGE/PNG",
          source: {
            type: "base64" as const,
            data: encoded,
            mediaType: "image/png",
          },
        },
        {
          mime: "image/png",
          source: {
            type: "url" as const,
            url: `data:image/png;base64,${encoded}`,
          },
        },
      ].map(f.process),
    );
    const paths = results.map(expectSaved);
    expect(new Set(paths).size).toBe(1);
    expect(paths[0]).toMatch(/[0-9a-f]{64}\.png$/);
    expect(await readFile(paths[0])).toEqual(PNG_BYTES);
    expect(await readdir(f.tempDir)).toHaveLength(1);
  });

  it("writes files readable only by the owner", async () => {
    const f = await fixture();
    const path = expectSaved(await f.process(bytesSource()));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("reuses an intact existing file and refreshes its mtime", async () => {
    const f = await fixture();
    const path = expectSaved(await f.process(bytesSource()));
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(path, old, old);
    const before = await stat(path);
    await f.process(bytesSource());
    const after = await stat(path);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBeGreaterThan(old.getTime() + 60_000);
  });

  it("restores a missing or damaged file", async () => {
    const f = await fixture();
    const path = expectSaved(await f.process(bytesSource()));
    await writeFile(path, "damaged");
    await f.process(bytesSource());
    expect(await readFile(path)).toEqual(PNG_BYTES);
    await unlink(path);
    await f.process(bytesSource());
    expect(await readFile(path)).toEqual(PNG_BYTES);
  });

  it("replaces a symlink planted at the saved path instead of following it", async () => {
    const f = await fixture();
    const path = expectSaved(await f.process(bytesSource()));
    // A 9-character relative target gives the link the same lstat size as the
    // 9-byte image, so only the regular-file check can reject it.
    const secret = join(f.tempDir, "secret123");
    await writeFile(secret, "not an image");
    await unlink(path);
    await symlink("secret123", path);
    expect((await lstat(path)).size).toBe(PNG_BYTES.length);
    expect(expectSaved(await f.process(bytesSource()))).toBe(path);
    expect((await lstat(path)).isSymbolicLink()).toBe(false);
    expect(await readFile(path)).toEqual(PNG_BYTES);
    expect(await readFile(secret, "utf8")).toBe("not an image");
  });

  it("separates identical bytes with different MIME types", async () => {
    const f = await fixture();
    const png = expectSaved(await f.process(bytesSource()));
    const jpeg = expectSaved(
      await f.process(bytesSource(PNG_BYTES, "image/jpeg")),
    );
    expect(png.replace(/\.png$/, "")).not.toBe(jpeg.replace(/\.jpg$/, ""));
  });

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ])("saves %s with a .%s extension", async (mime, extension) => {
    const f = await fixture();
    const path = expectSaved(await f.process(bytesSource(PNG_BYTES, mime)));
    expect(path.endsWith(`.${extension}`)).toBe(true);
  });

  it("passes file and HTTP(S) URLs through without creating files", async () => {
    const f = await fixture();
    const own = join(f.tempDir, "user-owned.png");
    await writeFile(own, PNG_BYTES);
    for (const [url, expected] of [
      [pathToFileURL(own).href, own],
      ["https://example.test/a.png", "https://example.test/a.png"],
      ["http://example.test/a.png", "http://example.test/a.png"],
    ]) {
      const result = await f.process({
        mime: "image/png",
        source: { type: "url", url },
      });
      expect(result).toEqual({
        ok: true,
        image: { path: expected, mime: "image/png" },
      });
    }
    expect(await readdir(f.tempDir)).toEqual(["user-owned.png"]);
  });

  it.each<[string, ImageAttachment, RegExp]>([
    [
      "malformed base64",
      {
        mime: "image/png",
        source: { type: "base64", data: "%%%", mediaType: "image/png" },
      },
      /Malformed base64/,
    ],
    [
      "empty bytes",
      {
        mime: "image/png",
        source: {
          type: "bytes",
          data: new Uint8Array(),
          mediaType: "image/png",
        },
      },
      /Empty image data/,
    ],
    [
      "a provider reference",
      {
        mime: "image/png",
        source: { type: "ref", provider: "test", id: "secret-reference" },
      },
      /Provider image reference/,
    ],
    [
      "an unsupported format",
      bytesSource(PNG_BYTES, "image/gif"),
      /Unsupported image format \(image\/gif\)/,
    ],
    [
      "an unsupported URL scheme",
      { mime: "image/png", source: { type: "url", url: "ftp://x.test/a" } },
      /Unsupported image URL scheme/,
    ],
    [
      "a missing local file",
      {
        mime: "image/png",
        source: { type: "url", url: "file:///nonexistent/easy-vision" },
      },
      /check the server temp directory/,
    ],
    [
      "a data URL with a different MIME type",
      {
        mime: "image/png",
        source: { type: "url", url: "data:image/jpeg;base64,YQ==" },
      },
      /mismatched image data URL/,
    ],
    [
      "a URL that needs private headers",
      {
        mime: "image/png",
        requiresHeaders: true,
        source: { type: "url", url: "https://x.test/private" },
      },
      /requires private headers/,
    ],
    [
      "an expired URL",
      {
        mime: "image/png",
        source: { type: "url", url: "https://x.test/old", expiresAt: 0 },
      },
      /expired/,
    ],
  ])("fails explicitly for %s", async (_name, attachment, reason) => {
    const f = await fixture();
    expect(expectFailure(await f.process(attachment))).toMatch(reason);
  });

  it("never leaks secrets or I/O details into reasons or logs", async () => {
    const f = await fixture();
    const blocked = join(f.tempDir, "not-a-directory");
    await writeFile(blocked, "fixture");
    const { log, messages } = recorder();
    const process = createImageProcessor(
      createConfigStore({ tempDir: blocked }),
      log,
    );
    const reason = expectFailure(await process(bytesSource()));
    expect(reason).not.toContain(blocked);
    const secret = expectFailure(
      await createImageProcessor(
        createConfigStore({ tempDir: f.tempDir }),
        log,
      )({
        mime: "image/png",
        source: { type: "ref", provider: "p", id: "secret-reference" },
      }),
    );
    expect(secret).not.toContain("secret-reference");
    expect(messages.info.join("\n")).not.toMatch(/secret-reference|ENOTDIR/);
  });

  it("logs each failure", async () => {
    const { log, messages } = recorder();
    const process = createImageProcessor(createConfigStore(), log);
    await process(bytesSource(PNG_BYTES, "image/gif"));
    expect(messages.info).toEqual([
      "Image processing failed: Unsupported image format (image/gif)",
    ]);
  });

  it("does not log successful saves", async () => {
    const f = await fixture();
    const { log, messages } = recorder();
    await createImageProcessor(f.config, log)(bytesSource());
    expect(messages.info).toEqual([]);
  });
});
