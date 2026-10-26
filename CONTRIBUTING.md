# Contributing

## Build and tests

The plugin targets **OpenCode v2** and is tested against **2.1.4**. OpenCode v1 is not supported; the last v1-compatible release is 1.6.1. Use Node.js >=22.18.0; CI uses Node 24.

```sh
npm ci
npm run format:check
npm run build
npm run typecheck
npm run test:coverage
```

Tests are TypeScript, run by [Vitest](https://vitest.dev) directly against `src/`, so no build is needed first. Each source module has a matching `test/<module>.test.ts`; shared fixtures live in `test/helpers.ts`. `npm run test:watch` re-runs on change, and `npm run typecheck` type-checks the tests. `npm run test:coverage` enforces the coverage thresholds in `vitest.config.ts` and writes an HTML report to `coverage/`.

`npm run format` formats `src/` and `test/`; the Husky hook also runs it.

`@opencode/plugin`, `@opencode/ai` and `effect` are dev dependencies used for types and tests. At runtime the plugin imports only `effect`, which OpenCode resolves to its own copy, so the published package depends on nothing but `strip-json-comments`. Keep OpenCode imports type-only (`import type`).

## Project-local OpenCode testing

Keep the root `index.js` bridge in the tarball: OpenCode's local-directory loader resolves a root `server`/`index`, not `package.main`. ESM/type exports and `main`/`types` still point to compiled `dist/` output.

Build, then configure the **package directory**, not a global single-file symlink, in a clean project's `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/opencode-easy-vision"],
  "mcp": {
    "servers": {
      "Vision": {
        "type": "local",
        "command": ["your-vision-mcp"],
      },
    },
  },
}
```

Set `.opencode/opencode-easy-vision.jsonc` with the active model pattern and exact catalog tool name. Use environment variables for credentials. Run `opencode run --standalone --model <provider/model> --file <image> <question>` with a private server; clipboard/TUI attachment-only behavior needs manual paste.

For deterministic runtime checks against the installed OpenCode binary (the runner checks for 2.1.4):

```sh
node scripts/v2-spike/run.mjs "$PWD/dist/index.js"
```

The fixture wrapper waits for catalog readiness and observes production rewriting before/after without rewriting images itself. It asserts actual outbound HTTP payloads, MCP reads, and which route the model sees in three MCP modes: `codemode: false`, `codemode: true` (tool stays behind `execute`), and unset (the plugin disables Code Mode). See the [probe docs](./scripts/v2-spike/README.md) for the isolated live OpenRouter test.

## Installed-package acceptance

Use `npm pack --ignore-scripts --pack-destination <temporary-directory>`, install the tarball in a clean temporary package, and pass its absolute `dist/index.js` to the fixture runner. Also test with the real vision MCP. Verify example-config auto-init after installation. Do not publish as part of testing.

Plugin logs go to OpenCode's log file (`~/.local/share/opencode/log/opencode.log`, or `<home>/data/opencode/log/opencode.log` in the fixture runner's isolated home), tagged `plugin=easy-vision`. Plugin `console` output is discarded by OpenCode.

Watched config changes reload automatically; unwatched dependencies may need `opencode service restart`. Get permission before restarting an active service. Test reload/unload, concurrent locations, session moves, model switches, historic images, failures, auxiliary requests, permissions, and remote filesystem limits.

## CI

CI runs install, formatting, build, and Node tests. Live MCP/API tests are opt-in and require ephemeral credentials, never committed keys.
