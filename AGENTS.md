# Agent Guidelines for opencode-easy-vision

## Purpose

This repository is a TypeScript OpenCode plugin that lets text-only models work with pasted images. The plugin saves or forwards image parts, removes the raw image attachments from the chat message, and injects instructions telling the model which MCP image-analysis tool to call.

Keep this file focused on maintainer instructions for coding agents. Do not copy the full configuration or setup guide here; link to the canonical docs instead.

## Canonical References

- User-facing setup and usage: [README.md](./README.md)
- Full plugin configuration reference: [CONFIGURATION.md](./CONFIGURATION.md)
- Agent-assisted user setup workflow: [AGENT_SETUP.md](./AGENT_SETUP.md)
- Local development and symlink testing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Example config shipped with the package: [opencode-easy-vision.example.jsonc](./opencode-easy-vision.example.jsonc)

## Project Facts

- TypeScript, strict mode, ES modules only.
- Runtime target is Node.js `>=18.0.0`.
- Plugin framework is `@opencode-ai/plugin`.
- Source lives in `src/`; compiled output is `dist/`.
- There is no test framework. Validation is formatting plus TypeScript build, followed by manual OpenCode testing when behavior changes.

## Commands

```bash
npm install
npm run format
npm run format:check
npm run build
```

Use `npm run build` before committing code changes. CI runs `npm ci`, `npm run format:check`, and `npm run build`.

The Husky pre-commit hook runs `npm run format`. It only formats `src/**/*.ts`.

## Architecture

The plugin entry point is [src/index.ts](./src/index.ts). It registers `experimental.chat.messages.transform` and wires together the modules below.

- [src/constants.ts](./src/constants.ts): package constants, defaults, MIME mappings, prompt templates.
- [src/types.ts](./src/types.ts): shared interfaces and function types.
- [src/config.ts](./src/config.ts): config discovery, JSON/JSONC parsing, validation, precedence, example-config auto-init, and runtime accessors.
- [src/patterns.ts](./src/patterns.ts): case-insensitive wildcard model matching.
- [src/images.ts](./src/images.ts): image part detection, URL handling, temp-file writing, and image extraction.
- [src/prompt.ts](./src/prompt.ts): prompt-template substitution and default injection prompt selection.
- [src/transform.ts](./src/transform.ts): message lookup, model extraction, image-part removal, and text-part replacement/creation.
- [src/cleanup.ts](./src/cleanup.ts): startup cleanup for plugin-owned temp files.

When adding behavior, preserve these module boundaries. Add a new small module for a new concern instead of growing [src/index.ts](./src/index.ts).

## Transform Flow

The hook should stay defensive and non-crashing:

1. Find the last user message.
2. Read the model from that message and check it against configured patterns.
3. Extract supported image file parts.
4. Save `data:` images to the configured temp directory; pass `file://` and HTTP(S) images through as paths/URLs.
5. Remove all image parts that the target model cannot consume directly.
6. Inject or update text with the MCP tool instructions and the user's original request.

If image processing partially or fully fails, log the failure, show a toast when the user can act on it, and keep OpenCode running.

## Coding Rules

- Use `import type` for TypeScript-only imports.
- Use `node:` prefixes for Node built-ins.
- Keep import order as type imports, Node built-ins, external packages, then local modules.
- Do not use `require`, `module.exports`, `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Prefer type guards for narrowing, especially around OpenCode `Part` variants.
- Prefer `??` for nullish defaults.
- Await filesystem operations and wrap I/O in `try`/`catch` when failure should not crash the plugin.
- Do not mutate parameters; return new data structures for message/part changes.
- Keep functions small and mostly pure. I/O and OpenCode logging/toasts are the expected side effects.
- Prefer Node built-ins over new dependencies unless the dependency removes real complexity.

## Configuration Changes

Configuration behavior is documented in [CONFIGURATION.md](./CONFIGURATION.md) and implemented in [src/config.ts](./src/config.ts). When changing config:

- Update `PluginConfig` in [src/types.ts](./src/types.ts).
- Update parsing, validation, precedence logging, and accessors in [src/config.ts](./src/config.ts).
- Update defaults in [src/constants.ts](./src/constants.ts) when applicable.
- Update [CONFIGURATION.md](./CONFIGURATION.md) and the example JSONC file.
- Avoid duplicating option tables or examples in this file.

The module-level `pluginConfig` state in [src/config.ts](./src/config.ts) is intentional. Other modules should use exported accessors instead of threading config through every call.

## Validation

For code changes, run:

```bash
npm run format:check
npm run build
```

Run `npm run format` only when formatting changes are needed. For behavior that depends on OpenCode runtime wiring, follow the manual testing flow in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Releases

Always confirm with the user before running any release command.

Use `npm version patch`, `npm version minor`, or `npm version major` to bump, commit, and tag. Push both the commit and tag so [.github/workflows/publish.yml](./.github/workflows/publish.yml) can publish to npm. Do not run `npm publish` manually.
