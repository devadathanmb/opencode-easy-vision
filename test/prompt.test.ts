import type { SavedImage } from "../src/types.js";
import { describe, expect, it } from "vitest";
import { createConfigStore } from "../src/config.js";
import { createPromptGenerator } from "../src/prompt.js";

const one: SavedImage[] = [{ path: "/tmp/a.png", mime: "image/png" }];
const two: SavedImage[] = [...one, { path: "/tmp/b.jpg", mime: "image/jpeg" }];
const generator = (promptTemplate?: string) =>
  createPromptGenerator(
    createConfigStore({ imageAnalysisTool: "Vision_tool", promptTemplate }),
  );

describe("default templates", () => {
  it("uses the single-image wording for one image", () => {
    const prompt = generator()(one, "what is this?", "direct");
    expect(prompt).toContain("The user has shared an image.");
    expect(prompt).toContain("- Image 1: /tmp/a.png");
    expect(prompt).toContain("Use the `Vision_tool` tool");
    expect(prompt).toContain("User's request: what is this?");
  });

  it("uses the multi-image wording and numbers every image", () => {
    const prompt = generator()(two, "compare", "direct");
    expect(prompt).toContain("The user has shared 2 images.");
    expect(prompt).toContain("- Image 1: /tmp/a.png\n- Image 2: /tmp/b.jpg");
  });

  it("asks for analysis when the user typed nothing", () => {
    expect(generator()(one, "", "direct")).toContain(
      "User's request: (analyze the image)",
    );
  });

  it("asks the model not to repeat completed analysis", () => {
    expect(generator()(one, "x", "direct")).toMatch(
      /do not repeat completed analysis\.$/,
    );
  });
});

describe("custom templates", () => {
  it("substitutes every variable, every time", () => {
    const prompt = generator(
      "{imageCount}|{imageList}|{toolName}|{userText}|{toolName}",
    )(one, "hi", "direct");
    expect(prompt.split("\n")[0]).toBe(
      "1|- Image 1: /tmp/a.png|Vision_tool|hi|Vision_tool",
    );
  });

  it("inserts values literally, without replacement patterns or re-expansion", () => {
    const images = [{ path: "/path/$&.png", mime: "image/png" }];
    const prompt = generator("{imageList}|{userText}")(
      images,
      "$& {imageCount} $1",
      "direct",
    );
    expect(prompt).toContain("- Image 1: /path/$&.png|$& {imageCount} $1");
  });
});

describe("tool routes", () => {
  it("adds execute guidance when the tool is behind Code Mode", () => {
    const prompt = generator()(one, "x", "codemode");
    expect(prompt).toContain("exposed through Code Mode");
    expect(prompt).toContain("discover the exact Vision_tool");
  });

  it("adds no Code Mode guidance for direct tools", () => {
    expect(generator()(one, "x", "direct")).not.toContain("Code Mode");
  });

  it("lists paths but forbids claiming analysis when the tool is unavailable", () => {
    const prompt = generator("{toolName} custom")(one, "x", "unavailable");
    expect(prompt).toContain("- Image 1: /tmp/a.png");
    expect(prompt).toContain("Vision_tool is not available");
    expect(prompt).toContain("Do not claim to have analyzed the images.");
    expect(prompt).not.toContain("custom");
  });
});
