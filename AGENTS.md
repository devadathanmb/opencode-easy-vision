# Agent Guidelines for opencode-minimax-easy-vision

## Project Overview

TypeScript plugin for OpenCode that enables vision support for models lacking native image attachment support. Intercepts pasted images, saves them to disk, and injects MCP tool instructions so models can analyze images via a configurable tool (default: `mcp_minimax_understand_image`).

- **Language**: TypeScript (ES2022, strict mode)
- **Runtime**: Node.js >= 18.0.0
- **Framework**: `@opencode-ai/plugin` (peer dep >=1.0.0, dev ^1.2.26)
- **Module System**: ES modules only
- **Architecture**: Single-file (`src/index.ts`) — all logic lives here

## Commands

```bash
npm install       # install deps
npm run build     # compile src/ → dist/ (tsc)
npm publish       # runs build first via prepublishOnly
```

**No test framework.** Manual testing: build → add to `opencode.json` plugins → paste an image with a matching model.

## Code Style

### Imports
- `import type` for TypeScript types
- `node:` prefix for Node.js built-ins
- Order: type imports → Node.js imports → external imports

### Naming
| Kind | Convention |
|------|------------|
| Files | lowercase (`index.ts`) |
| Functions/variables | camelCase |
| Constants | UPPER_SNAKE_CASE |
| Types/Interfaces | PascalCase |
| Type guards | `is*` prefix (`isImageFilePart`, `isTextPart`) |

### Type Safety
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`
- Use type guard predicates (`part is FilePart`) for narrowing
- Use `??` for nullish defaults

### Async/Error Handling
- Prefer `async/await` over promise chains
- Always `await` file system operations
- `try/catch` all I/O; log errors, never swallow silently
- Plugin must never crash OpenCode — catch and continue gracefully
- Logging errors may be suppressed with `.catch(() => {})`

### Style
- Pure functions — no side effects except I/O and logging
- Small, single-responsibility functions
- Don't mutate parameters; return new data structures

## Plugin Architecture

### Exports
```typescript
export const MinimaxEasyVisionPlugin: Plugin = async (input) => { ... };
export default MinimaxEasyVisionPlugin;
```

### Hook
`experimental.chat.messages.transform` — runs before each LLM call:
1. Finds the last user message
2. Checks if the current model matches configured patterns
3. Extracts image parts (`file://`, `data:`, `http(s)://` URLs all handled)
4. Saves base64/data-URL images to a temp dir; passes file/HTTP paths through
5. Removes image parts from the message (model can't process them natively)
6. Replaces/creates a text part with MCP tool instructions + original user text

### Key Types
```typescript
interface PluginConfig {
  models?: string[];          // model patterns; defaults to DEFAULT_MODEL_PATTERNS
  imageAnalysisTool?: string; // MCP tool name; defaults to DEFAULT_IMAGE_ANALYSIS_TOOL
  promptTemplate?: string;    // custom injection prompt; must include at least one variable
}

interface SavedImage {
  path: string;  // local file path or remote URL
  mime: string;
  partId: string;
}

interface ModelInfo {
  providerID: string;
  modelID: string;
}
```

### Module-level State
`pluginConfig` is a single mutable module-level variable loaded once at plugin init via `loadPluginConfig()`. This is intentional.

## Configuration

Config is read from JSON files (not `opencode.json`), with project-level taking precedence over user-level.

| Priority | Path |
|----------|------|
| 1 (highest) | `.opencode/opencode-minimax-easy-vision.json` |
| 2 | `~/.config/opencode/opencode-minimax-easy-vision.json` |

```json
{
  "models": ["minimax/*", "openai/*", "*/minimax-m2.5"],
  "imageAnalysisTool": "mcp_minimax_understand_image"
}
```

**Defaults** (when no config provided):
- `models`: `["minimax/*"]`
- `imageAnalysisTool`: `"mcp_minimax_understand_image"`

### Model Pattern Matching
Format: `provider/model` with wildcard support:
- `*` — all models
- `minimax/*` — all models from provider
- `*/minimax-m2.5` — specific model from any provider
- `openai/gpt-4o` — exact match


No-slash patterns match against both provider and model ID.

## Notes for Agents

1. **Single-file**: All code in `src/index.ts`. Don't add modules unless necessary.
2. **No linter/formatter**: Follow existing style exactly.
3. **Functional over OOP**: No classes, no mutations.
4. **ES modules only**: No `require` or `module.exports`.
5. **Minimal deps**: Prefer Node.js built-ins over new packages.
6. **Build before commit**: Run `npm run build` and verify `dist/` output.
7. **Versioning**: Follow semver (major.minor.patch).
