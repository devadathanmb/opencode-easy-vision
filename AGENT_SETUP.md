# opencode-easy-vision — Agent Setup

Set up the `opencode-easy-vision` OpenCode plugin. Read existing configuration before editing it, and update keys in place instead of replacing whole files.

This plugin version (2.x) requires **OpenCode v2**.

---

## Pre-flight — read context before editing

Before editing any files, do all of the following:

1. **Check the OpenCode version:** Run `opencode --version`. If it is 1.x, stop and tell the user that this plugin version needs OpenCode v2; on OpenCode v1 they must use `"plugin": ["opencode-easy-vision@1"]` instead, configured as described in the 1.x README.

2. **Fetch the full configuration reference** and keep it available throughout this session: `https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/CONFIGURATION.md`

3. **Inspect the existing OpenCode config:** Check `~/.config/opencode/opencode.json` and `.jsonc`, then check the `opencode.json` and `.jsonc` files that apply to the current project.

   Note whether the `mcp` block exists and which servers it defines (OpenCode v2 uses `mcp.servers`; the older layout with servers directly under `mcp` is still accepted), and whether `"opencode-easy-vision"` is already in the `plugins` array or the older `plugin` array.

4. **Inspect plugin config files:** Check `~/.config/opencode/opencode-easy-vision.jsonc` and `.opencode/opencode-easy-vision.jsonc`. If you find `opencode-easy-vision.json` or `opencode-minimax-easy-vision.json(c)` files instead, tell the user they are no longer read and offer to rename them to `opencode-easy-vision.jsonc`. If an existing config sets `imageAnalysisTool` to `mcp_minimax_understand_image` (the 1.x default), it must be updated in Question 4.

   Note the current values of `models` and `imageAnalysisTool`. Do not create a plugin config file unless the chosen options require one.

> **For all file edits:** Use the scope the user selects. If a config file already exists at that scope, keep its extension and update the relevant key or block in place.

---

## Question 1 — Setup scope

Ask the user:

> Should this setup apply to all projects or only the current project?
>
> 1. **All projects** — use the user-level OpenCode and plugin config files
> 2. **Current project only** — use the project-level OpenCode and plugin config files

Do not modify both scopes unless the user explicitly asks.

---

## Question 2 — Which MCP image analysis tool?

Ask the user:

> Which MCP image analysis tool would you like to use?
>
> 1. **MiniMax Coding Plan MCP** — official MiniMax tool
> 2. **openrouter-image-mcp** — routes through OpenRouter and supports paid or free vision models
> 3. **Something else** — I already have one configured, or I want a different tool

---

**If they choose 1 (MiniMax Coding Plan MCP):**

Ask for their MiniMax API key. They can create one at https://platform.minimax.io. Offer two ways to supply it: an environment variable referenced as `{env:MINIMAX_API_KEY}` (recommended), or the key written directly into the selected OpenCode config. If they choose the latter, tell them the key will be stored in that file and ask for confirmation.

Add or update the `MiniMax` entry under `mcp.servers` in the selected OpenCode config:

```json
"MiniMax": {
  "type": "local",
  "command": ["uvx", "minimax-coding-plan-mcp"],
  "environment": {
    "MINIMAX_API_KEY": "{env:MINIMAX_API_KEY}",
    "MINIMAX_API_HOST": "https://api.minimax.io"
  }
}
```

Tool name to use in plugin config: **`MiniMax_understand_image`** (the default).

---

**If they choose 2 (openrouter-image-mcp):**

Ask for their OpenRouter API key. They can create one at https://openrouter.ai/keys. As with MiniMax, offer `{env:OPENROUTER_API_KEY}` (recommended) or storing the key in the selected OpenCode config, and confirm before writing a key to a file.

Ask which vision model they want to use. If unsure, recommend `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, a free multimodal model designed for image perception and reasoning. Free model availability changes over time, so check [OpenRouter's free models](https://openrouter.ai/models?fmt=cards&max_price=0) for current alternatives and explain that free endpoints use shared capacity, so latency and availability can vary.

Add or update the `openrouter_image` entry under `mcp.servers` in the selected OpenCode config:

```json
"openrouter_image": {
  "type": "local",
  "command": ["npx", "openrouter-image-mcp"],
  "environment": {
    "OPENROUTER_API_KEY": "{env:OPENROUTER_API_KEY}",
    "OPENROUTER_MODEL": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
  }
}
```

Tool name to use in plugin config: **`openrouter_image_analyze_image`**.

---

**If they choose 3 (something else):**

Ask the user to describe the tool or provide its name or repo URL. Fetch its documentation to find:

- The correct `mcp.servers` entry for `opencode.json`
- The exact name of the image-analysis tool the server defines (look for function/tool definitions in the README or source)

Add or update the entry under `mcp.servers`, checking first whether the block already exists.

OpenCode exposes the tool as `<server key>_<tool name>`, with characters other than letters, digits, `_` and `-` in the server key replaced by `_`. For server key `vision` and tool `describe_image`, the name is `vision_describe_image`. Names are case-sensitive.

Do not set `codemode` on this server: the plugin turns OpenCode's MCP Code Mode off for it automatically so the model can call the tool directly.

---

## Question 3 — Which models should the plugin activate for?

Ask the user:

> Which models should this plugin activate for?
>
> 1. **MiniMax provider models only** — the default; activates for models where MiniMax is the direct provider in OpenCode (e.g. `minimax/text-01`, `minimax-cn/*`)
> 2. **All MiniMax models regardless of provider** — also covers MiniMax models accessed via OpenRouter or other providers
> 3. **All models** — activates for every model
> 4. **Specific model(s)** — I'll tell you which ones

> **Important:** Option 1 (default) does NOT activate for a MiniMax model accessed through OpenRouter or another provider. If the user is using MiniMax via OpenRouter, they need option 2 or 4.

**If they choose 1:** No plugin config change needed for `models` — this is already the default. Skip to Question 4.

**If they choose 2:** Set `models` to match any model ID containing "minimax" regardless of provider:

```jsonc
{
  "models": ["*minimax*"],
}
```

**If they choose 3:** Set `models` to match everything:

```jsonc
{
  "models": ["*"],
}
```

**If they choose 4:** Ask which model IDs or patterns. Refer to CONFIGURATION.md (fetched in pre-flight) for pattern syntax. Example:

```jsonc
{
  // Each entry is a glob matched against the full model ID (e.g. "openrouter/minimax-text-01")
  "models": ["openrouter/*minimax*", "z-ai/*"],
}
```

For all options except 1: update the `models` key in the selected plugin config. If no plugin config exists at that scope, create `opencode-easy-vision.jsonc` there.

---

## Question 4 — MCP tool name

The plugin config's `imageAnalysisTool` must end up equal to the tool name from Question 2. Check the selected scope's plugin config, and also any config at the other scope that would override it:

- **Tool name is `MiniMax_understand_image` (the built-in default):** no `imageAnalysisTool` is needed. If an existing config sets `imageAnalysisTool` to anything else, including the 1.x default `mcp_minimax_understand_image`, remove that key (or set it to `MiniMax_understand_image`).
- **Any other tool name:** add or update `imageAnalysisTool` in the selected plugin config:

```jsonc
{
  "imageAnalysisTool": "<tool name from Question 2>",
}
```

If the plugin config file already exists, update the key in place. If not, create `opencode-easy-vision.jsonc` at the selected scope.

---

## Step 5 — Add the plugin

Check whether `opencode-easy-vision` is already in the selected OpenCode config's `plugins` array, or in an older `plugin` array (OpenCode v2 still reads it). If it is there as `opencode-easy-vision@next`, skip this step. If it is unpinned or pinned to 1.x (for example `opencode-easy-vision@1`), change it to `opencode-easy-vision@next`: 2.x is published under the `next` tag. If it is missing, add it to `plugins`:

```json
{
  "plugins": ["opencode-easy-vision@next"]
}
```

For the all-projects scope you can instead run `opencode plugin add opencode-easy-vision@next`.

---

## Step 6 — Summarise and verify

Before asking the user to restart, show them a brief summary of every change you made:

- Which OpenCode config was updated (MCP entry, plugin array)
- Which plugin config was updated and what was written to it (`models`, `imageAnalysisTool`), or note if no plugin config was needed

Then tell the user to **restart OpenCode**. OpenCode v2 runs plugins in a background service: if the plugin does not load after restarting the terminal, ask the user to run `opencode service restart`. Do not restart the service yourself without their approval.

After they restart, ask them to paste an image (`Cmd+V` / `Ctrl+V`) into the chat with the configured model selected and send a message. The model should call the MCP tool and return an image analysis.

**If it doesn't work, check in order:**

1. Is the MCP tool name in `imageAnalysisTool` exactly the name OpenCode exposes (`<server key>_<tool name>`, case-sensitive)? Is the MCP server connected?
2. Does the model ID match the configured `models` pattern? Remember: OpenRouter-served models won't match `minimax/*` even if the underlying model is from MiniMax.
3. Is the API key set correctly in the MCP environment block in the selected OpenCode config?
4. Check OpenCode's log (`~/.local/share/opencode/log/opencode.log` by default) for lines tagged `plugin=easy-vision`.
5. If in doubt, re-read `https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/CONFIGURATION.md` for the full option reference.
