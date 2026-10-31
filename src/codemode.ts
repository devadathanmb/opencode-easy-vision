import type { MCPEditor } from "@opencode/plugin/effect/mcp";
import type { Logger } from "./types.js";

// Mirrors OpenCode's MCP tool naming: `${namespace(server)}_${tool}`.
function namespace(server: string): string {
  return server.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Servers whose namespace could have produced `toolName`. More than one match is
 * ambiguous: with servers "foo" and "foo_bar", "foo_bar_tool" may be either
 * "foo" + "bar_tool" or "foo_bar" + "tool", and distinct names can share a namespace.
 */
export function findToolServers(
  toolName: string,
  servers: readonly string[],
): string[] {
  return servers.filter((server) =>
    toolName.startsWith(`${namespace(server)}_`),
  );
}

// Code Mode hides MCP tools behind `execute`, which contradicts a prompt that names
// the tool directly. Only an unambiguous vision server is changed, and an explicit
// user `codemode` setting always wins.
export function createCodeModeTransform(
  getToolName: () => string,
  isEnabled: () => boolean,
  log: Logger,
) {
  const logged = new Set<string>();
  const logOnce = (message: string) => {
    if (logged.has(message)) return;
    logged.add(message);
    log(message);
  };
  return (editor: MCPEditor): void => {
    if (!isEnabled()) return;
    const toolName = getToolName();
    const servers = findToolServers(
      toolName,
      editor.list().map(([name]) => name),
    );
    if (servers.length > 1) {
      logOnce(
        `Left Code Mode unchanged: ${toolName} could belong to MCP servers ${servers.map((s) => `"${s}"`).join(", ")}. Set "codemode": false on the right server.`,
      );
      return;
    }
    const [server] = servers;
    if (server === undefined) return;
    editor.update(server, (config) => {
      if (config.codemode !== undefined) return;
      config.codemode = false;
      logOnce(
        `Disabled Code Mode for MCP server "${server}" so ${toolName} is directly callable`,
      );
    });
  };
}
