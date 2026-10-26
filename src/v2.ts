import type { ToolRoute } from "./types.js";

export function resolveToolRoute(
  toolName: string,
  tools: Record<string, unknown>,
  registered: readonly { id: string; options?: { codemode?: boolean } }[],
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
