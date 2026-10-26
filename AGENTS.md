# Agent Guidelines for opencode-easy-vision

## Purpose

This repository is a TypeScript OpenCode plugin that lets text-only models work with pasted images. The plugin saves or forwards image parts, removes the raw image attachments from the chat message, and injects instructions telling the model which MCP image-analysis tool to call.

Keep this file focused on maintainer instructions for coding agents. Do not copy the full configuration or setup guide here; link to the canonical docs instead.

## Canonical References

- User-facing setup and usage: [README.md](./README.md)
- Full plugin configuration reference: [CONFIGURATION.md](./CONFIGURATION.md)
- Agent-assisted user setup workflow: [AGENT_SETUP.md](./AGENT_SETUP.md)
- Local development and installed-package testing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Example config shipped with the package: [opencode-easy-vision.example.jsonc](./opencode-easy-vision.example.jsonc)

## Project Facts

- TypeScript, strict mode, ES modules only.
- Runtime target is Node.js `>=22.18.0`.
- Targets OpenCode v2 only (tested on 2.1.4); v1 support ended with 1.6.1. Plugin framework is `@opencode/plugin` (Effect API); media/message types are from `@opencode/ai`.
- The only runtime import from the OpenCode ecosystem is `effect`, which the host resolves to its own instance. Import `@opencode/*` with `import type` only, so the published package needs no OpenCode dependencies.
- Source lives in `src/`; compiled output is `dist/`.
- Tests are TypeScript in `test/`, run by Vitest directly against `src/` (one `<module>.test.ts` per source module, shared fixtures in `test/helpers.ts`). Coverage thresholds in `vitest.config.ts` fail CI on regression. Runtime fixtures against a real OpenCode binary live in `scripts/v2-spike/`.

## Commands

```bash
npm install
npm run format
npm run format:check
npm run build
npm run typecheck
npm test
npm run test:coverage
```

Use `npm run build` before committing code changes. CI runs install, format, build, test type-check, and tests with coverage thresholds.

The Husky pre-commit hook runs `npm run format`. It only formats `src/**/*.ts`.

## Architecture

The plugin entry point is [src/index.ts](./src/index.ts): a thin Effect shell that default-exports a typed `{ id, effect }` plugin object, routes logs to the host logger, loads config, runs cleanup, and registers the MCP transform plus the `context`, `compaction`, `title`, and `generate` hooks. Keep plugin logic out of Effect: hooks delegate to plain async code through `Effect.promise`.

- [src/constants.ts](./src/constants.ts): package constants, defaults, MIME mappings, prompt templates.
- [src/types.ts](./src/types.ts): shared interfaces and function types.
- [src/config.ts](./src/config.ts): config discovery, JSON/JSONC parsing, validation, precedence, example-config auto-init, and runtime accessors.
- [src/patterns.ts](./src/patterns.ts): case-insensitive wildcard model matching.
- [src/images.ts](./src/images.ts): normalized image sources, URL handling, deterministic atomic temp-file writing.
- [src/prompt.ts](./src/prompt.ts): prompt-template substitution and default injection prompt selection.
- [src/transform.ts](./src/transform.ts): immutable V2 content rewriting, preserving text/media ordering and metadata.
- [src/request.ts](./src/request.ts): per-request rewriting (model match, location guard, tool routing, transform, failure fallback) over Promise-based host lookups.
- [src/v2.ts](./src/v2.ts): request-tool exposure routing without permission bypasses.
- [src/codemode.ts](./src/codemode.ts): MCP transform that disables Code Mode for the server providing `imageAnalysisTool`, respecting explicit user settings.
- [src/file-lock.ts](./src/file-lock.ts): cross-instance write/cleanup coordination, never configuration storage.
- [src/cleanup.ts](./src/cleanup.ts): startup cleanup for plugin-owned temp files.

When adding behavior, preserve these module boundaries. Add a new small module for a new concern instead of growing [src/index.ts](./src/index.ts).

## Transform Flow

The hook should stay defensive and non-crashing:

1. Match the active request model and verify the session belongs to this instance's location.
2. Normalize images across all retained user messages; never change durable attachments.
3. Save bytes/base64/data sources; pass through usable file/HTTP URLs. Fail explicitly for refs and unsupported formats.
4. Replace targeted raw media even on failure; retain unrelated content and all original text.
5. Add analysis guidance only for the current task, honoring direct/Code Mode exposure.
6. Keep historical/auxiliary image context neutral; recreate missing generated files on later passes.

If image processing fails, log through the injected `Logger`/`Notifier` (host Effect logger; OpenCode discards plugin `console` output) and add model-visible failure notes; the server has no terminal UI dependency. Do not log image bytes, secret URLs, credentials, or raw provider errors.

## Coding Rules

- Use `import type` for TypeScript-only imports.
- Use `node:` prefixes for Node built-ins.
- Keep import order as type imports, Node built-ins, external packages, then local modules.
- Do not use `require`, `module.exports`, `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer type guards for narrowing around V2 content/source variants.
- Prefer `??` for nullish defaults.
- Await filesystem operations and wrap I/O in `try`/`catch` when failure should not crash the plugin.
- Do not mutate parameters; return new data structures for message/part changes. The one exception is the OpenCode hook event or MCP editor, whose API contract is mutation: assign the newly built value once (for example `event.messages = ...`).
- Keep functions small and mostly pure. I/O and server logging are the expected side effects.
- Prefer Node built-ins over new dependencies unless the dependency removes real complexity.

## Configuration Changes

Configuration behavior is documented in [CONFIGURATION.md](./CONFIGURATION.md) and implemented in [src/config.ts](./src/config.ts). When changing config:

- Update `PluginConfig` in [src/types.ts](./src/types.ts).
- Update parsing, validation, precedence logging, and accessors in [src/config.ts](./src/config.ts).
- Update defaults in [src/constants.ts](./src/constants.ts) when applicable.
- Update [CONFIGURATION.md](./CONFIGURATION.md) and the example JSONC file.
- Avoid duplicating option tables or examples in this file.

Each adapter instance owns a `createConfigStore()` with isolated accessor closures. Bind accessors to helper factories once rather than threading options through each operation. Never restore module-global configuration: V2 locations coexist in one service. Inline host plugin options (`ctx.options`) are not read; config comes only from the dedicated files.

## Validation

For code changes, run:

```bash
npm run format:check
npm run build
npm run typecheck
npm run test:coverage
```

Every behavior change needs a test in the matching `test/<module>.test.ts`. Do not lower coverage thresholds to make CI pass. Tests may cast to `unknown` only where OpenCode types are impractical to construct (branded IDs, the full plugin `Context`); keep such casts in `test/helpers.ts` or one documented spot per file.

Run `npm run format` only when formatting changes are needed. For behavior that depends on OpenCode runtime wiring, follow the manual testing flow in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Releases

Always confirm with the user before running any release command.

2.x is OpenCode v2 only. Do not publish v1 fixes from `main`.

Use `npm version patch`, `npm version minor`, or `npm version major` to bump, commit, and tag. Push both the commit and tag so [.github/workflows/publish.yml](./.github/workflows/publish.yml) can publish to npm. Do not run `npm publish` manually.
