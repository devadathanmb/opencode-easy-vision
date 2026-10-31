# Contributing

The plugin targets **OpenCode v2**; the last release for OpenCode v1 is 1.6.1. You need Node.js >=22.18.0 and [`just`](https://just.systems). Run `just` to list all tasks.

## Build and test

```sh
just install
just check   # format check, build, type-check, tests with coverage thresholds
```

Tests are TypeScript, run by [Vitest](https://vitest.dev) directly against `src/`. Each source module has a matching `test/<module>.test.ts`, with shared fixtures in `test/helpers.ts`. `just test config` runs only matching files and `just watch` re-runs on change. `just coverage` writes an HTML report to `coverage/`.

`just fmt` formats the code; the pre-commit hook runs it too.

`@opencode/plugin`, `@opencode/ai` and `effect` are dev dependencies, used for types and tests only. At runtime the plugin imports `effect` from OpenCode itself, so the published package depends only on `strip-json-comments`. Import `@opencode/*` packages with `import type`.

## End-to-end tests

```sh
just e2e
```

This packs the plugin, installs the tarball into a temporary directory, and runs the `opencode` binary on your `PATH` against a fake model provider and a fake vision MCP server, with Code Mode unset, off and on. It checks that the image reaches the model as a saved path, that the model is offered the vision tool on the expected route, and that the MCP server reads the saved file. OpenCode runs with an isolated home directory, so your config and credentials are not used, and no real model is called.

Run it after changes to `src/index.ts`, hooks or packaging. CI does not run it.

## Trying it in OpenCode

Run `just build`, then point a test project's `opencode.json` at your checkout:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-easy-vision"],
  "mcp": {
    "servers": {
      "MiniMax": {
        "type": "local",
        "command": ["uvx", "minimax-coding-plan-mcp"],
        "environment": { "MINIMAX_API_KEY": "{env:MINIMAX_API_KEY}" },
      },
    },
  },
}
```

OpenCode loads a plugin directory through its root `index.js`, which re-exports `dist/`. Plugins run in OpenCode's background service, so run `opencode service restart` after rebuilding.

Plugin logs go to `~/.local/share/opencode/log/opencode.log`, tagged `plugin=easy-vision`. OpenCode discards plugin `console` output.

## CI

CI checks formatting, builds, type-checks and runs the unit tests with coverage thresholds. Publishing to npm happens from a version tag; see `just release`.
