import type { RegisteredTool, ToolRoute } from "./types.js";

// How the model can reach the vision tool in this request: as a direct tool,
// through Code Mode's `execute`, or not at all.
export function resolveToolRoute(
  toolName: string,
  tools: Record<string, unknown>,
  registered: readonly RegisteredTool[],
): ToolRoute {
  if (Object.hasOwn(tools, toolName)) return "direct";
  const tool = registered.find((entry) => entry.id === toolName);
  if (
    tool &&
    tool.options?.codemode !== false &&
    Object.hasOwn(tools, "execute")
  )
    return "codemode";
  return "unavailable";
}
