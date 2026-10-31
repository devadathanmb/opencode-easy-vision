import { describe, expect, it } from "vitest";
import { resolveToolRoute } from "../src/tool-route.js";

const TOOL = "Vision_understand_image";

describe("resolveToolRoute", () => {
  it("is direct when the request exposes the tool", () => {
    expect(resolveToolRoute(TOOL, { [TOOL]: {} }, [])).toBe("direct");
  });

  it("is Code Mode when the tool is registered behind execute", () => {
    expect(
      resolveToolRoute(TOOL, { execute: {} }, [
        { id: TOOL, options: { codemode: true } },
      ]),
    ).toBe("codemode");
    expect(resolveToolRoute(TOOL, { execute: {} }, [{ id: TOOL }])).toBe(
      "codemode",
    );
  });

  it.each([
    [
      "the tool is registered but opted out of Code Mode",
      { execute: {} },
      [{ id: TOOL, options: { codemode: false } }],
    ],
    ["execute is not exposed", {}, [{ id: TOOL }]],
    ["the tool is not registered", { execute: {} }, []],
    ["only a differently-cased tool exists", { [TOOL.toLowerCase()]: {} }, []],
  ])("is unavailable when %s", (_name, tools, registered) => {
    expect(resolveToolRoute(TOOL, tools, registered)).toBe("unavailable");
  });

  it("ignores inherited object properties", () => {
    expect(resolveToolRoute("toString", {}, [])).toBe("unavailable");
  });
});
