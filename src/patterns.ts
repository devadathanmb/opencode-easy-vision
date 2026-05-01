import { getConfiguredModels } from "./config.js";
import type { ModelInfo } from "./types.js";

function matchesWildcardPattern(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();

  if (p === "*") return true;

  // Contains: *text*
  if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
    return v.includes(p.slice(1, -1));
  }

  // Prefix: text*
  if (p.endsWith("*")) {
    return v.startsWith(p.slice(0, -1));
  }

  // Suffix: *text
  if (p.startsWith("*")) {
    return v.endsWith(p.slice(1));
  }

  return v === p;
}

function matchesSinglePattern(pattern: string, model: ModelInfo): boolean {
  if (pattern === "*") return true;

  const slashIndex = pattern.indexOf("/");

  if (slashIndex === -1) {
    // No slash: ambiguous whether the user meant provider or model — accept either.
    return (
      matchesWildcardPattern(pattern, model.modelID) ||
      matchesWildcardPattern(pattern, model.providerID)
    );
  }

  const providerPattern = pattern.slice(0, slashIndex);
  const modelPattern = pattern.slice(slashIndex + 1);

  return (
    matchesWildcardPattern(providerPattern, model.providerID) &&
    matchesWildcardPattern(modelPattern, model.modelID)
  );
}

export function modelMatchesAnyPattern(model: ModelInfo | undefined): boolean {
  if (!model) return false;

  const patterns = getConfiguredModels();
  return patterns.some((pattern) => matchesSinglePattern(pattern, model));
}
