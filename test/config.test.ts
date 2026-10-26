import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConfigStore } from "../src/config.js";
import {
  DEFAULT_CLEANUP_AFTER_HOURS,
  DEFAULT_IMAGE_ANALYSIS_TOOL,
  DEFAULT_MODEL_PATTERNS,
  TEMP_DIR_NAME,
} from "../src/constants.js";
import { recorder, silent, tempDir } from "./helpers.js";

async function layout() {
  const root = await tempDir("easy-vision-config-");
  const home = join(root, "home");
  const project = join(root, "project");
  await mkdir(home, { recursive: true });
  await mkdir(join(project, ".opencode"), { recursive: true });
  const writeUser = (name: string, body: unknown) =>
    writeFile(
      join(home, name),
      typeof body === "string" ? body : JSON.stringify(body),
    );
  const writeProject = (name: string, body: unknown) =>
    writeFile(
      join(project, ".opencode", name),
      typeof body === "string" ? body : JSON.stringify(body),
    );
  const load = async (log = silent, autoInit = false) => {
    const store = createConfigStore({}, { userDirectory: home, autoInit });
    await store.load(project, log);
    return store;
  };
  return { home, project, writeUser, writeProject, load };
}

describe("defaults", () => {
  it("applies when no config files exist", async () => {
    const { load } = await layout();
    const store = await load();
    expect(store.getConfiguredModels()).toEqual(DEFAULT_MODEL_PATTERNS);
    expect(store.getImageAnalysisTool()).toBe(DEFAULT_IMAGE_ANALYSIS_TOOL);
    expect(store.getPromptTemplate()).toBeUndefined();
    expect(store.getTempDir()).toBe(join(tmpdir(), TEMP_DIR_NAME));
    expect(store.getCleanupAfterHours()).toBe(DEFAULT_CLEANUP_AFTER_HOURS);
    expect(store.getDisableCodeMode()).toBe(true);
  });

  it("hands out copies so callers cannot mutate the stored models", async () => {
    const store = createConfigStore({ models: ["a/*"] });
    const models = store.getConfiguredModels() as string[];
    models.push("b/*");
    expect(store.getConfiguredModels()).toEqual(["a/*"]);
  });
});

describe("precedence", () => {
  it("prefers project over user, per field", async () => {
    const { writeUser, writeProject, load } = await layout();
    await writeUser("opencode-easy-vision.json", {
      models: ["user/*"],
      imageAnalysisTool: "User_tool",
      cleanupAfterHours: 48,
    });
    await writeProject("opencode-easy-vision.json", {
      models: ["project/*"],
      disableCodeMode: false,
    });
    const store = await load();
    expect(store.getConfiguredModels()).toEqual(["project/*"]);
    expect(store.getImageAnalysisTool()).toBe("User_tool");
    expect(store.getCleanupAfterHours()).toBe(48);
    expect(store.getDisableCodeMode()).toBe(false);
  });

  it("prefers .jsonc over .json at the same level", async () => {
    const { writeProject, load } = await layout();
    await writeProject("opencode-easy-vision.json", { models: ["json/*"] });
    await writeProject(
      "opencode-easy-vision.jsonc",
      '{\n  // comment\n  "models": ["jsonc/*"],\n}',
    );
    expect((await load()).getConfiguredModels()).toEqual(["jsonc/*"]);
  });

  it("falls back to .json and warns when .jsonc is invalid", async () => {
    const { writeProject, load } = await layout();
    await writeProject("opencode-easy-vision.jsonc", "{ not json");
    await writeProject("opencode-easy-vision.json", { models: ["json/*"] });
    const { log, messages } = recorder();
    expect((await load(log)).getConfiguredModels()).toEqual(["json/*"]);
    expect(messages.info.join("\n")).toMatch(/invalid JSON.*\.jsonc/);
  });

  it("ignores the removed pre-2.0 config filenames", async () => {
    const { writeUser, writeProject, load } = await layout();
    await writeUser("opencode-minimax-easy-vision.json", {
      models: ["legacy/*"],
    });
    await writeProject("opencode-minimax-easy-vision.jsonc", {
      imageAnalysisTool: "Legacy_tool",
    });
    const store = await load();
    expect(store.getConfiguredModels()).toEqual(DEFAULT_MODEL_PATTERNS);
    expect(store.getImageAnalysisTool()).toBe(DEFAULT_IMAGE_ANALYSIS_TOOL);
  });

  it("replaces the previous config on reload", async () => {
    const { writeProject, project, home } = await layout();
    const store = createConfigStore(
      {},
      { userDirectory: home, autoInit: false },
    );
    await writeProject("opencode-easy-vision.json", { models: ["first/*"] });
    await store.load(project, silent);
    await writeProject("opencode-easy-vision.json", {});
    await store.load(project, silent);
    expect(store.getConfiguredModels()).toEqual(DEFAULT_MODEL_PATTERNS);
  });
});

describe("validation", () => {
  it.each([
    ["models", { models: "minimax/*" }],
    ["models", { models: [] }],
    ["models", { models: [1, 2] }],
    ["imageAnalysisTool", { imageAnalysisTool: "   " }],
    ["imageAnalysisTool", { imageAnalysisTool: "x".repeat(257) }],
    ["imageAnalysisTool", { imageAnalysisTool: 42 }],
    ["promptTemplate", { promptTemplate: "no variables here" }],
    ["promptTemplate", { promptTemplate: "  " }],
    ["tempDir", { tempDir: "  " }],
    ["cleanupAfterHours", { cleanupAfterHours: 0 }],
    ["cleanupAfterHours", { cleanupAfterHours: -1 }],
    ["cleanupAfterHours", { cleanupAfterHours: "24" }],
    ["disableCodeMode", { disableCodeMode: "false" }],
  ])("drops an invalid %s value and falls back", async (_field, body) => {
    const { writeUser, writeProject, load } = await layout();
    const valid = {
      models: ["user/*"],
      imageAnalysisTool: "User_tool",
      promptTemplate: "{imageList}",
      tempDir: "/user-temp",
      cleanupAfterHours: 12,
      disableCodeMode: false,
    };
    await writeUser("opencode-easy-vision.json", valid);
    await writeProject("opencode-easy-vision.json", body);
    const store = await load();
    expect(store.getConfiguredModels()).toEqual(valid.models);
    expect(store.getImageAnalysisTool()).toBe(valid.imageAnalysisTool);
    expect(store.getPromptTemplate()).toBe(valid.promptTemplate);
    expect(store.getTempDir()).toBe(valid.tempDir);
    expect(store.getCleanupAfterHours()).toBe(valid.cleanupAfterHours);
    expect(store.getDisableCodeMode()).toBe(valid.disableCodeMode);
  });

  it("keeps only string entries in models", async () => {
    const { writeProject, load } = await layout();
    await writeProject("opencode-easy-vision.json", {
      models: ["a/*", 3, null, "b/*"],
    });
    expect((await load()).getConfiguredModels()).toEqual(["a/*", "b/*"]);
  });

  it("trims promptTemplate and tempDir", async () => {
    const { writeProject, load } = await layout();
    await writeProject("opencode-easy-vision.json", {
      promptTemplate: "  {imageList}  ",
      tempDir: "  /trimmed  ",
    });
    const store = await load();
    expect(store.getPromptTemplate()).toBe("{imageList}");
    expect(store.getTempDir()).toBe("/trimmed");
  });

  it("ignores a config file that is not an object", async () => {
    const { writeProject, load } = await layout();
    await writeProject("opencode-easy-vision.json", "[1, 2]");
    expect((await load()).getConfiguredModels()).toEqual(
      DEFAULT_MODEL_PATTERNS,
    );
  });
});

describe("isolation", () => {
  it("keeps concurrently loaded stores independent", async () => {
    const a = await layout();
    const b = await layout();
    await a.writeProject("opencode-easy-vision.json", { models: ["a/*"] });
    await b.writeProject("opencode-easy-vision.json", { models: ["b/*"] });
    const [storeA, storeB] = await Promise.all([a.load(), b.load()]);
    expect(storeA.getConfiguredModels()).toEqual(["a/*"]);
    expect(storeB.getConfiguredModels()).toEqual(["b/*"]);
  });
});

describe("example config auto-init", () => {
  it("creates the user example once and never overwrites it", async () => {
    const { home, load } = await layout();
    const target = join(home, "opencode-easy-vision.jsonc");
    await load(silent, true);
    const example = await readFile(
      new URL("../opencode-easy-vision.example.jsonc", import.meta.url),
      "utf8",
    );
    expect(await readFile(target, "utf8")).toBe(example);
    await writeFile(target, '{ "models": ["mine/*"] }');
    const store = await load(silent, true);
    expect(await readFile(target, "utf8")).toBe('{ "models": ["mine/*"] }');
    expect(store.getConfiguredModels()).toEqual(["mine/*"]);
  });

  it("does not create the example when a user .json config exists", async () => {
    const { home, writeUser, load } = await layout();
    await writeUser("opencode-easy-vision.json", {});
    await load(silent, true);
    await expect(
      readFile(join(home, "opencode-easy-vision.jsonc")),
    ).rejects.toThrow();
  });

  it("ships an example that parses to exactly the defaults", async () => {
    const { load } = await layout();
    await load(silent, true);
    const store = await load();
    expect(store.getConfiguredModels()).toEqual(DEFAULT_MODEL_PATTERNS);
    expect(store.getImageAnalysisTool()).toBe(DEFAULT_IMAGE_ANALYSIS_TOOL);
    expect(store.getPromptTemplate()).toBeUndefined();
    expect(store.getTempDir()).toBe(join(tmpdir(), TEMP_DIR_NAME));
    expect(store.getCleanupAfterHours()).toBe(DEFAULT_CLEANUP_AFTER_HOURS);
    expect(store.getDisableCodeMode()).toBe(true);
  });
});

describe("cleanup directories", () => {
  it("covers the configured and default temp dirs without duplicates", () => {
    const fallback = join(tmpdir(), TEMP_DIR_NAME);
    expect(createConfigStore().getTempDirsForCleanup()).toEqual([fallback]);
    expect(
      createConfigStore({ tempDir: "/custom" }).getTempDirsForCleanup(),
    ).toEqual(["/custom", fallback]);
  });
});
