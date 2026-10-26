# V2 runtime spike

This is the Phase 0 compatibility probe, not the migrated Easy Vision plugin. It targets the installed **OpenCode 2.1.4** binary and uses Node.js with no new repository dependencies.

Recorded baseline outcomes and remaining gates: [RESULTS.md](./RESULTS.md).

```sh
node scripts/v2-spike/run.mjs
```

The runner creates temporary projects and an isolated home/config/data/cache environment, then invokes private servers with `opencode run --standalone`. It does not use your running service, existing configuration, provider keys, or MCP connections. A loopback-only OpenAI-compatible fixture produces deterministic tool calls; a local stdio MCP fixture checks that the saved PNG is readable. Neither fixture performs real image analysis or calls an external model.

The runner checks the binary version before proceeding and installs exactly `@opencode/plugin@2.1.4` into a temporary plugin package with lifecycle scripts disabled. npm registry access is required; repository dependencies are unchanged. Each OpenCode invocation has a two-minute timeout. The child environment uses an allowlist so provider credentials and OpenCode configuration overrides are not inherited. The fixtures are deliberately limited to synthetic inline PNGs.

The probe waits up to twenty seconds for MCP connection **and** the actual tool registry entry before admitting each test prompt. A connected server alone does not mean its tools have reached the model's catalog yet.

Files:

- `run.mjs`: temporary environment, provider fixture, and assertions.
- `plugin.mjs`: minimal V2 context-hook probe; not the production plugin.
- `mcp.mjs`: stdio MCP fixture implementing `understand_image`.
- `after.mjs`: non-mutating observer loaded after the real production package.

Pass an absolute production `dist/index.js` as the first argument to `run.mjs` to test that package instead of the image-rewriting probe. OpenCode loads the real package directory natively between before/after observers; neither observer saves or rewrites images in this mode. Use the entrypoint from an installed tarball to validate the package and dependency contract.

Checks:

- A model declaring only text input still exposes PNG media to the context hook.
- V2 exposes the active model as `{ providerID, id }`.
- The hook can replace media before provider dispatch, preserving user text.
- Image-only input works.
- Tool-driven continuations rerun the hook with stable saved image paths.
- The `MiniMax` server registers `MiniMax_understand_image`.
- Direct MCP exposure and default Code Mode both allow access to the saved PNG.

Outbound assertions run against the actual provider HTTP payload, not just the hook's edited messages. Synthetic outbound payloads are retained in each project's `outbound.json`; hook records contain shape metadata and generated paths, not image bytes or user prompts.

The temporary artifact directory is printed on success or command failure. It contains synthetic fixtures, hook metadata, isolated OpenCode state/logs, and per-command output for debugging. It is deliberately retained; remove that exact directory yourself when finished. Do not attach real images to this probe.

The CLI rejects empty `run --file` messages. The image-only case uses a fixture-only admission hook to clear a sentinel before persistence. The production migration must still use request-context hooks, not admission edits.

## Live OpenRouter gate

The ignored local setup at `.opencode/v2-test/opencode.json` uses the catalog's text-only `deepseek/deepseek-v4-flash-0731` and a direct `Vision_understand_image` MCP tool backed by `google/gemini-2.5-flash`. DeepSeek V4.1 Flash advertises image input and is not a text-only test candidate. `openrouter-mcp.mjs` is a test backend, not a production dependency.

The OpenRouter catalog queried on 2026-10-11 contained 458 entries, 162 without image input and 119 of those advertising tool support. The complete non-vision subset is retained in the ignored `.opencode/v2-test/non-vision-models.json`. These are catalog declarations, not a guarantee of endpoint availability or account access.

Set `OPENROUTER_API_KEY` in the launching environment, then run:

```sh
node scripts/v2-spike/run-live.mjs
# Optional: attach a different image (sent to OpenRouter).
node scripts/v2-spike/run-live.mjs /absolute/path/image.png
```

This incurs real API charges. By default it sends a synthetic red PNG. The launcher uses isolated OpenCode home/config/state directories and a private server. Only the vision MCP tool is permitted. The ignored local config contains absolute paths for this checkout; do not commit credentials or generated state. The observer needs its pinned dependency installed first (`npm install --ignore-scripts --prefix .opencode/v2-test/plugin`). The local setup now loads the installed production package separately; `productionEntry` on the observer switches off its image rewriting. A completed tool call must use a plugin-generated image path to pass.

Still requires follow-up: clipboard/TUI behavior, reload/unload, concurrent location isolation, session moves, auxiliary hooks, and installed-package testing. Passing these probes does not establish those behaviors or prove compatibility with any other OpenCode release.
