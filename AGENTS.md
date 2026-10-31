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
- Targets OpenCode v2 only; the last OpenCode v1 release is 1.6.1. Plugin framework is `@opencode/plugin` (Effect API); media/message types are from `@opencode/ai`.
- The only runtime import from the OpenCode ecosystem is `effect`, which the host resolves to its own instance. Import `@opencode/*` with `import type` only, so the published package needs no OpenCode dependencies.
- Source lives in `src/`; compiled output is `dist/`.
- Tests are TypeScript in `test/`, run by Vitest directly against `src/` (one `<module>.test.ts` per source module, shared fixtures in `test/helpers.ts`). Coverage thresholds in `vitest.config.ts` fail CI on regression. End-to-end tests against the real OpenCode binary live in `test/e2e/` and run only through `just e2e`.

## Commands

Use [`just`](./justfile) for every task; run `just` to list recipes. The recipes wrap the npm scripts in `package.json`, which CI calls directly.

```bash
just install       # npm ci
just fmt           # format src/ and test/
just build
just typecheck     # type-check src/ and test/
just test          # Vitest; extra args pass through, e.g. `just test config`
just coverage      # tests plus coverage thresholds
just check         # everything CI runs: fmt-check, build, typecheck, coverage
just e2e           # packed plugin against the installed OpenCode binary
```

Run `just check` before committing code changes.

The Husky pre-commit hook runs `npm run format`, which formats `src/` and `test/`.

## Architecture

The plugin entry point is [src/index.ts](./src/index.ts): a thin Effect shell that default-exports a typed `{ id, effect }` plugin object, routes logs to the host logger, loads config, runs cleanup, and registers the MCP transform plus the `context`, `compaction`, `title`, and `generate` hooks. Keep plugin logic out of Effect: hooks delegate to plain async code through `Effect.promise`.

- [src/constants.ts](./src/constants.ts): package constants, defaults, MIME mappings, prompt templates.
- [src/types.ts](./src/types.ts): shared interfaces and function types.
- [src/config.ts](./src/config.ts): config discovery, JSONC parsing, validation, precedence, example-config auto-init, and runtime accessors.
- [src/patterns.ts](./src/patterns.ts): case-insensitive wildcard model matching.
- [src/images.ts](./src/images.ts): normalized image sources, URL handling, deterministic atomic temp-file writing.
- [src/prompt.ts](./src/prompt.ts): prompt-template substitution and default injection prompt selection.
- [src/transform.ts](./src/transform.ts): immutable message rewriting that keeps part order and metadata.
- [src/request.ts](./src/request.ts): per-request rewriting (model match, location guard, tool routing, transform, failure fallback) over Promise-based host lookups.
- [src/tool-route.ts](./src/tool-route.ts): whether the vision tool is reachable directly, through Code Mode's `execute`, or not at all.
- [src/codemode.ts](./src/codemode.ts): MCP transform that disables Code Mode for the server providing `imageAnalysisTool`, respecting explicit user settings.
- [src/file-lock.ts](./src/file-lock.ts): per-path lock so image writes and cleanup never race.
- [src/cleanup.ts](./src/cleanup.ts): startup cleanup for plugin-owned temp files.

When adding behavior, preserve these module boundaries. Add a new small module for a new concern instead of growing [src/index.ts](./src/index.ts).

## Transform Flow

The hook should stay defensive and non-crashing:

1. Act only when the request's model matches and the session belongs to this plugin instance's project.
2. Rewrite the outgoing model context only; never the stored chat history.
3. Save inline image data to disk; pass file and HTTP(S) URLs through. Fail with a clear reason for provider refs and unsupported formats.
4. Remove every image from user messages, even when saving fails. Keep all text and non-image media in place.
5. Add tool instructions only to the latest user message, for the route the tool is reachable on. Compaction, title and generate requests get image paths only.
6. Recreate saved files that have gone missing on later passes.

If image processing fails, log through the injected `Logger`/`Notifier` (host Effect logger; OpenCode discards plugin `console` output) and add model-visible failure notes; the server has no terminal UI dependency. Do not log image bytes, secret URLs, credentials, or raw provider errors.

## Coding Rules

- Use `import type` for TypeScript-only imports.
- Use `node:` prefixes for Node built-ins.
- Keep import order as type imports, Node built-ins, external packages, then local modules.
- Do not use `require`, `module.exports`, `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer type guards for narrowing around content and media source variants.
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

Each adapter instance owns a `createConfigStore()` with isolated accessor closures. Bind accessors to helper factories once rather than threading options through each operation. Never restore module-global configuration: one OpenCode service hosts plugin instances for several projects. Inline host plugin options (`ctx.options`) are not read; config comes only from the dedicated files.

## Validation

For code changes, run:

```bash
just check
```

For changes to OpenCode runtime wiring (`src/index.ts`, hooks, packaging), also run `just e2e`.

Every behavior change needs a test in the matching `test/<module>.test.ts`. Do not lower coverage thresholds to make CI pass. Tests may cast to `unknown` only where OpenCode types are impractical to construct (branded IDs, the full plugin `Context`); keep such casts in `test/helpers.ts` or one documented spot per file.

Run `just fmt` only when formatting changes are needed. For behavior that depends on OpenCode runtime wiring, follow the manual testing flow in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Releases

Always confirm with the user before running any release command.

2.x is OpenCode v2 only. Do not publish v1 fixes from `main`. The publish workflow tags 2.x releases `next`, so `latest` keeps serving 1.x until the user decides to promote 2.x with `npm dist-tag`.

Release with `just release patch|minor|major`. It runs `just check`, then `npm version` (bump, commit, tag) and `git push --follow-tags`, so [.github/workflows/publish.yml](./.github/workflows/publish.yml) publishes to npm. The recipe asks for confirmation, but get the user's approval before running it. Do not run `npm publish` manually.
