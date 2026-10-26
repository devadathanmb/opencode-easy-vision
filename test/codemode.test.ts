import type { MCPEditor } from "@opencode/plugin/promise/mcp";
import { describe, expect, it } from "vitest";
import { createCodeModeTransform, findToolServers } from "../src/codemode.js";
import { mcpEditor as editor, recorder } from "./helpers.js";

const codemodeOf = (e: MCPEditor, name: string) => e.get(name)?.codemode;

describe("findToolServers", () => {
  it.each([
    ["MiniMax_understand_image", ["Other", "MiniMax"], ["MiniMax"]],
    ["my_server_tool", ["my.server"], ["my.server"]],
    ["foo_bar_tool", ["foo", "foo_bar"], ["foo", "foo_bar"]],
    ["a_b_tool", ["a.b", "a_b"], ["a.b", "a_b"]],
    ["Missing_tool", ["MiniMax"], []],
    ["minimax_understand_image", ["MiniMax"], []],
    ["MiniMax", ["MiniMax"], []],
  ])("%s in %j -> %j", (tool, servers, expected) => {
    expect(findToolServers(tool, servers)).toEqual(expected);
  });
});

describe("createCodeModeTransform", () => {
  it("disables Code Mode only on the server providing the tool", () => {
    const e = editor({ MiniMax: {}, Other: {} });
    createCodeModeTransform(
      () => "MiniMax_understand_image",
      () => true,
      () => {},
    )(e);
    expect(codemodeOf(e, "MiniMax")).toBe(false);
    expect(codemodeOf(e, "Other")).toBeUndefined();
  });

  it.each([true, false])(
    "respects an explicit codemode: %s on the server",
    (codemode) => {
      const e = editor({ MiniMax: { codemode } });
      createCodeModeTransform(
        () => "MiniMax_understand_image",
        () => true,
        () => {},
      )(e);
      expect(codemodeOf(e, "MiniMax")).toBe(codemode);
    },
  );

  it("does nothing when disabled in plugin config", () => {
    const e = editor({ MiniMax: {} });
    createCodeModeTransform(
      () => "MiniMax_understand_image",
      () => false,
      () => {},
    )(e);
    expect(codemodeOf(e, "MiniMax")).toBeUndefined();
  });

  it("does nothing when no server provides the tool", () => {
    const e = editor({ Other: {} });
    createCodeModeTransform(
      () => "MiniMax_understand_image",
      () => true,
      () => {},
    )(e);
    expect(codemodeOf(e, "Other")).toBeUndefined();
  });

  it("reads config on every run, so reloads take effect", () => {
    let tool = "A_tool";
    const transform = createCodeModeTransform(
      () => tool,
      () => true,
      () => {},
    );
    const first = editor({ A: {}, B: {} });
    transform(first);
    tool = "B_tool";
    const second = editor({ A: {}, B: {} });
    transform(second);
    expect(codemodeOf(first, "A")).toBe(false);
    expect(codemodeOf(second, "A")).toBeUndefined();
    expect(codemodeOf(second, "B")).toBe(false);
  });

  it.each([
    ["a prefix of another server", { foo: {}, foo_bar: {} }, "foo_bar_tool"],
    ["normalized to the same namespace", { "a.b": {}, a_b: {} }, "a_b_tool"],
  ])(
    "leaves Code Mode alone and explains why when servers are ambiguous (%s)",
    (_name, servers, tool) => {
      const { log, messages } = recorder();
      const e = editor(servers);
      const transform = createCodeModeTransform(
        () => tool,
        () => true,
        log,
      );
      transform(e);
      transform(e);
      for (const name of Object.keys(servers))
        expect(codemodeOf(e, name)).toBeUndefined();
      expect(messages.info).toHaveLength(1);
      expect(messages.info[0]).toContain("Left Code Mode unchanged");
    },
  );

  it("logs once per server even though OpenCode reruns transforms", () => {
    const { log, messages } = recorder();
    const transform = createCodeModeTransform(
      () => "MiniMax_understand_image",
      () => true,
      log,
    );
    transform(editor({ MiniMax: {} }));
    transform(editor({ MiniMax: {} }));
    expect(messages.info).toEqual([
      'Disabled Code Mode for MCP server "MiniMax" so MiniMax_understand_image is directly callable',
    ]);
  });
});
