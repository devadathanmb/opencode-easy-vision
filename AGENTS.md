# Agent Guidelines for opencode-minimax-easy-vision

## Project Overview

TypeScript plugin for OpenCode that enables vision support for models lacking native image attachment support. Intercepts pasted images, saves them to disk, and injects MCP tool instructions so models can analyze images via a configurable tool (default: `mcp_minimax_understand_image`).

- **Language**: TypeScript (ES2022, strict mode)
- **Runtime**: Node.js >= 18.0.0
- **Framework**: `@opencode-ai/plugin` (peer dep >=1.0.0, dev ^1.2.26)
- **Module System**: ES modules only
- **Architecture**: Multi-module (`src/`) — each file owns one responsibility

## Commands

```bash
npm install              # install deps (also installs husky git hooks)
npm run build            # compile src/ → dist/ (tsc)
npm run format           # format src/ with Prettier
npm run format:check     # check formatting without writing
```

Husky pre-commit hook runs `npm run format` automatically. Use `git commit --no-verify` to skip.

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
  tempDir?: string;           // custom temp directory; defaults to OS temp + opencode-minimax-vision/
  cleanupAfterHours?: number; // temp file cleanup threshold; defaults to 24
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

### Source Modules

| File | Responsibility |
|------|----------------|
| `constants.ts` | All compile-time constants (patterns, MIME types, defaults) |
| `types.ts` | Shared interfaces: `PluginConfig`, `SavedImage`, `ModelInfo`, `Logger`, `Notifier` |
| `config.ts` | Config loading (JSON + JSONC), parsing, validation, precedence, accessors, and auto-init of example config |
| `patterns.ts` | Wildcard model pattern matching |
| `images.ts` | Type guards, URL handlers (`file://`, `data:`, `http(s)://`), file I/O, image extraction |
| `prompt.ts` | Prompt template rendering and injection prompt generation |
| `transform.ts` | Message structural modification (find, remove parts, update text) |
| `cleanup.ts` | Temp file deletion on startup |
| `index.ts` | Plugin entry point — wires everything together, registers the hook |

### Module-level State
`pluginConfig` is a single mutable module-level variable in `config.ts`, loaded once at plugin init via `loadPluginConfig()`. Accessor functions (`getConfiguredModels()`, `getTempDir()`, etc.) are exported from `config.ts` and used by other modules — no threading of config as a parameter. This is intentional.

## Configuration

Config is read from `.json` or `.jsonc` files (not `opencode.json`), with project-level taking precedence over user-level.

| Priority | Level | Path |
|----------|-------|------|
| 1 (highest) | Project | `.opencode/opencode-minimax-easy-vision.json` or `.jsonc` |
| 2 | User | `~/.config/opencode/opencode-minimax-easy-vision.json` or `.jsonc` |

If no user-level config exists, the plugin auto-creates an example `.jsonc` file at `~/.config/opencode/opencode-minimax-easy-vision.jsonc` on first load.

See [CONFIGURATION.md](./CONFIGURATION.md) for the full config reference, including all options, model pattern syntax, prompt template variables, and example configs.

## Releases

**Always confirm with the user before executing any release step.**

1. Bump version, commit, and tag in one step:
   ```bash
   npm version patch   # bug fixes / docs
   npm version minor   # new features, backwards compatible
   npm version major   # breaking changes
   ```
   This updates `package.json`, creates a git commit, and creates a `v*` tag automatically.

2. Push commits and the tag:
   ```bash
   git push && git push --tags
   ```
   The `v*` tag triggers `.github/workflows/publish.yml`, which runs CI then publishes to npm automatically. **Never run `npm publish` manually.**

## Notes for Agents

1. **Multi-module**: Each file in `src/` owns one responsibility. Add new files for new concerns; don't consolidate back into `index.ts`.
2. **Formatter**: Prettier with husky pre-commit hook.
3. **Functional over OOP**: No classes, no mutations.
4. **ES modules only**: No `require` or `module.exports`.
5. **Minimal deps**: Prefer Node.js built-ins over new packages.
6. **Build before commit**: Run `npm run build` and verify `dist/` output.
