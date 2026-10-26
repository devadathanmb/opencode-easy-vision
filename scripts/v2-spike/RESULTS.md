# V2 baseline probe results

## 2026-10-26 re-run on OpenCode 2.1.4

The production package was re-validated against **OpenCode 2.1.4** after moving to the Effect plugin API, making OpenCode imports type-only, and adding the Code Mode transform. `node scripts/v2-spike/run.mjs <entry>` passed in both modes, run once from the checkout and once from an `npm pack` tarball installed into a clean project. The installed package contained only `opencode-easy-vision` and `strip-json-comments`, which proves OpenCode supplies `effect` at runtime.

- The fixture runs three MCP modes and asserts the route the model sees: `direct` (`codemode: false`), `codemode` (`codemode: true`, so the tool stays behind `execute` and the plugin must not override it) and `auto` (unset, so the plugin disables Code Mode and the tool is exposed directly). All three passed, each with one MCP call per task.
- Plugin logs reached `opencode.log` tagged `plugin=easy-vision`. The earlier `console` logging from the Promise API version never reached the log.

The sections below record the original 2.0.26 baseline.
