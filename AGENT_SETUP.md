# opencode-easy-vision — Agent Setup

You are setting up the `opencode-easy-vision` OpenCode plugin. Follow every step below in order. Do not skip steps.

---

## Pre-flight — read context before asking anything

Before asking the user any questions, do all of the following:

1. **Fetch the full configuration reference** and keep it available throughout this session: `https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/CONFIGURATION.md`

2. **Read the main OpenCode config:** `~/.config/opencode/opencode.json`

   Note whether the `mcp` block exists, what keys it already has, and whether `"opencode-easy-vision"` is already in the `plugin` array.

3. **Read the plugin config if it exists:** `~/.config/opencode/opencode-easy-vision.jsonc`

   Note the current values of `models` and `imageAnalysisTool`. If the file does not exist, that is fine; create it later if needed.

> **For all file edits:** check whether the file and the specific key/block already exist. Update in place rather than replacing the whole file.

---

## Question 1 — Which MCP image analysis tool?

Ask the user:

> Which MCP image analysis tool would you like to use?
>
> 1. **MiniMax Coding Plan MCP** — official MiniMax tool
> 2. **openrouter-image-mcp** — routes through OpenRouter and supports paid or free vision models
> 3. **Something else** — I already have one configured, or I want a different tool

---

**If they choose 1 (MiniMax Coding Plan MCP):**

Ask for their MiniMax API key. They can create one at https://platform.minimax.io.

Add or update the `MiniMax` entry in the `mcp` block of `~/.config/opencode/opencode.json`:

```json
"MiniMax": {
  "type": "local",
  "command": ["uvx", "minimax-coding-plan-mcp"],
  "environment": {
    "MINIMAX_API_KEY": "<their key>",
    "MINIMAX_API_HOST": "https://api.minimax.io"
  }
}
```

Tool name to use in plugin config: **`mcp_minimax_understand_image`** (OpenCode lowercases the server key when generating the tool name: `MiniMax` → `mcp_minimax_<tool>`)

---

**If they choose 2 (openrouter-image-mcp):**

Ask for their OpenRouter API key. They can create one at https://openrouter.ai/keys.

Ask which vision model they want to use. If unsure, recommend `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, a free multimodal model designed for image perception and reasoning. Free model availability changes over time, so check [OpenRouter's free models](https://openrouter.ai/models?fmt=cards&max_price=0) for current alternatives and explain that free endpoints use shared capacity, so latency and availability can vary.

Add or update the `openrouter_image` entry in the `mcp` block of `~/.config/opencode/opencode.json`:

```json
"openrouter_image": {
  "type": "local",
  "command": ["npx", "openrouter-image-mcp"],
  "environment": {
    "OPENROUTER_API_KEY": "<their key>",
    "OPENROUTER_MODEL": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
  }
}
```

Tool name to use in plugin config: **`openrouter_image_analyze_image`** (server key `openrouter_image` + tool `analyze_image`)

---

**If they choose 3 (something else):**

Ask the user to describe the tool or provide its name or repo URL. Fetch its documentation to find:

- The correct `mcp` block entry for `opencode.json`
- The exact tool name the server exposes (look for function/tool definitions in the README or source)

Add or update the entry in the `mcp` block, checking first whether the block already exists.

Use the exact tool name OpenCode exposes. It is typically **`<lowercased-server-key>_<tool-name>`**, where `<lowercased-server-key>` is the key used in the `mcp` block.

---

## Question 2 — Which models should the plugin activate for?

Ask the user:

> Which models should this plugin activate for?
>
> 1. **MiniMax provider models only** — the default; activates for models where MiniMax is the direct provider in OpenCode (e.g. `minimax/text-01`, `minimax-cn/*`)
> 2. **All MiniMax models regardless of provider** — also covers MiniMax models accessed via OpenRouter or other providers
> 3. **All models** — activates for every model
> 4. **Specific model(s)** — I'll tell you which ones

> **Important:** Option 1 (default) does NOT activate for a MiniMax model accessed through OpenRouter or another provider. If the user is using MiniMax via OpenRouter, they need option 2 or 4.

**If they choose 1:** No plugin config change needed for `models` — this is already the default. Skip to Question 3.

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

For all options except 1: update the `models` key in `~/.config/opencode/opencode-easy-vision.jsonc`. If the file does not exist, create it.

---

## Question 3 — MCP tool name

This step is only needed if the tool name is **not** `mcp_minimax_understand_image` (the built-in default).

If the tool name from Question 1 differs from the default, add or update `imageAnalysisTool` in `~/.config/opencode/opencode-easy-vision.jsonc`:

```jsonc
{
  "imageAnalysisTool": "<tool name from Question 1>",
}
```

Check whether the file already exists. If it does, update the `imageAnalysisTool` key in place. If not, create the file.

If the tool name is `mcp_minimax_understand_image`, skip this step.

---

## Step 4 — Add the plugin

Check whether `"opencode-easy-vision"` is already in the `plugin` array. If it is, skip this step. If not, add it:

```json
{
  "plugin": ["opencode-easy-vision"]
}
```

---

## Step 5 — Summarise and verify

Before asking the user to restart, show them a brief summary of every change you made:

- What was added/updated in `opencode.json` (MCP entry, plugin array)
- Which plugin config was updated and what was written to it (models, imageAnalysisTool), or note if no plugin config was needed

Then tell the user to **restart OpenCode**.

After they restart, ask them to paste an image (`Cmd+V` / `Ctrl+V`) into the chat with the configured model selected and send a message. The model should call the MCP tool and return an image analysis.

**If it doesn't work, check in order:**

1. Is the MCP tool name in `imageAnalysisTool` exactly the name OpenCode exposes?
2. Does the model ID match the configured `models` pattern? Remember: OpenRouter-served models won't match `minimax/*` even if the underlying model is from MiniMax.
3. Is the API key set correctly in the MCP environment block in `opencode.json`?
4. If in doubt, re-read `https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/CONFIGURATION.md` for the full option reference.
