import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

interface Manifest {
  main: string;
  types: string;
  exports: Record<string, { import: string; types: string }>;
  files: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

describe("package contract", () => {
  it("points main, types and exports at the compiled entry", async () => {
    const manifest = JSON.parse(await read("package.json")) as Manifest;
    expect(manifest.main).toBe("dist/index.js");
    expect(manifest.exports["."].import).toBe(`./${manifest.main}`);
    expect(manifest.exports["."].types).toBe(`./${manifest.types}`);
  });

  it("ships the root index.js bridge, example config and docs", async () => {
    // OpenCode's local-directory loader resolves <dir>/index, not package.main.
    const manifest = JSON.parse(await read("package.json")) as Manifest;
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        "index.js",
        "dist",
        "opencode-easy-vision.example.jsonc",
        "CONFIGURATION.md",
        "AGENT_SETUP.md",
      ]),
    );
    expect(await read("index.js")).toContain(
      'export { EasyVisionPlugin, default } from "./dist/index.js";',
    );
  });

  it("has no OpenCode runtime dependencies; effect is an optional peer", async () => {
    // The host supplies effect; installing it would duplicate a 50 MB package.
    const manifest = JSON.parse(await read("package.json")) as Manifest;
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
