import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

// OpenCode supplies `effect` and the @opencode packages at runtime; shipping our
// own copies would load a second, incompatible instance.
describe("package contract", () => {
  it("depends only on strip-json-comments; effect is an optional peer", async () => {
    const manifest = JSON.parse(await read("package.json")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([
      "strip-json-comments",
    ]);
    expect(Object.keys(manifest.peerDependencies ?? {})).toEqual(["effect"]);
    expect(manifest.peerDependenciesMeta?.effect?.optional).toBe(true);
  });

  it("imports @opencode packages for types only", async () => {
    const files = (await readdir(new URL("../src", import.meta.url))).filter(
      (name) => name.endsWith(".ts"),
    );
    for (const file of files) {
      const source = await read(`src/${file}`);
      const runtime = source.match(/^import (?!type\b)[^;]*from "@opencode\//m);
      expect(runtime, `${file} has a runtime @opencode import`).toBeNull();
    }
  });
});
