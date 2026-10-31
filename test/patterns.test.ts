import { describe, expect, it } from "vitest";
import { createConfigStore } from "../src/config.js";
import { DEFAULT_MODEL_PATTERNS } from "../src/constants.js";
import { createModelMatcher } from "../src/patterns.js";

const matcher = (models?: string[]) =>
  createModelMatcher(createConfigStore({ models }));
const model = (providerID: string, modelID: string) => ({
  providerID,
  modelID,
});

describe("createModelMatcher", () => {
  it("never matches an unknown model", () => {
    expect(matcher(["*"])(undefined)).toBe(false);
  });

  it("matches everything with a bare *", () => {
    expect(matcher(["*"])(model("any", "thing"))).toBe(true);
  });

  it.each([
    ["minimax/*", model("minimax", "m2"), true],
    ["minimax/*", model("minimax-cn", "m2"), false],
    ["*/m2", model("anyone", "m2"), true],
    ["*/m2", model("anyone", "m2.5"), false],
    ["minimax/m2", model("minimax", "m2"), true],
    ["minimax/m2", model("minimax", "m2.5"), false],
    ["minimax/*m2*", model("minimax", "abab-m2-chat"), true],
    ["minimax/*-chat", model("minimax", "abab-m2-chat"), true],
    ["minimax/*-chat", model("minimax", "abab-m2-chat-x"), false],
  ])("provider/model pattern %s", (pattern, input, expected) => {
    expect(matcher([pattern])(input)).toBe(expected);
  });

  it("matches a slash-less pattern against provider or model ID", () => {
    const matches = matcher(["minimax*"]);
    expect(matches(model("minimax", "x"))).toBe(true);
    expect(matches(model("openrouter", "minimax-m2"))).toBe(true);
    expect(matches(model("openrouter", "deepseek"))).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matcher(["MiniMax/*"])(model("MINIMAX", "m2"))).toBe(true);
  });

  it("splits on the first slash so nested model IDs work", () => {
    const matches = matcher(["openrouter/deepseek/*"]);
    expect(matches(model("OPENROUTER", "DeepSeek/model"))).toBe(true);
    expect(matches(model("other", "deepseek/model"))).toBe(false);
  });

  it("matches any configured pattern", () => {
    const matches = matcher(["a/*", "b/*"]);
    expect(matches(model("b", "x"))).toBe(true);
    expect(matches(model("c", "x"))).toBe(false);
  });

  it("defaults to the MiniMax provider patterns only", () => {
    const matches = matcher();
    for (const pattern of DEFAULT_MODEL_PATTERNS) {
      expect(matches(model(pattern.slice(0, -2), "anything"))).toBe(true);
    }
    expect(matches(model("openrouter", "minimax/minimax-m2"))).toBe(false);
  });
});
