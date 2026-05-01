# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to models that lack it — paste images directly into the chat and ask questions, just like you would with Claude or GPT.

## Table of Contents

* [The Problem](#the-problem)
* [Demo](#demo)
* [Setup](#setup)
  * [1. Configure an MCP image analysis tool](#1-configure-an-mcp-image-analysis-tool)
  * [2. Install the plugin](#2-install-the-plugin)
* [Usage](#usage)
* [Configuration](#configuration)
* [Supported Image Formats](#supported-image-formats)
* [Troubleshooting](#troubleshooting)
* [Contributing](#contributing)
* [License](#license)
* [References](#references)

## The Problem

Many models — open-weight ones especially — have no vision capability. They are text-only and simply cannot process image input. For some (like MiniMax), a workaround exists: an MCP tool that reads the image externally using a vision service and returns the analysis as text. But that tool requires a local file path, not a clipboard paste — meaning you'd have to save every screenshot manually, find the path, and type it in.

This plugin automates the entire workaround. It intercepts pasted images, saves them to disk, and injects the right instructions for the model to call the MCP tool with the correct path. You paste, you ask — the plugin handles the rest.

## Demo

| Without the plugin | With the plugin |
|:-:|:-:|
| <img src="https://github.com/user-attachments/assets/d0f65d61-8384-4eea-9013-7325b3bf200a" width="100%"> | <img src="https://github.com/user-attachments/assets/c2b54c5b-f14a-40ae-96ec-4e3ced8bde2e" width="100%"> |
| The image is silently ignored by the model. | The model analyzes the attached image correctly before answering. |

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## Setup

### 1. Configure an MCP image analysis tool

The plugin works with any MCP server that can read an image and return its analysis as text. Add one to your `opencode.json`.

**Default — MiniMax Coding Plan MCP:**

```json
{
  "mcp": {
    "MiniMax": {
      "type": "local",
      "command": ["uvx", "minimax-coding-plan-mcp"],
      "environment": {
        "MINIMAX_API_KEY": "your-api-key-here",
        "MINIMAX_API_HOST": "https://api.minimax.io"
      }
    }
  }
}
```

**Alternative — [openrouter-image-mcp](https://github.com/JonathanJude/openrouter-image-mcp):**

Routes image analysis through OpenRouter, giving you access to any vision-capable model including free ones.

```json
{
  "mcp": {
    "openrouter_image": {
      "type": "local",
      "command": ["npx", "openrouter-image-mcp"],
      "environment": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "OPENROUTER_MODEL": "nvidia/nemotron-nano-12b-v2-vl:free"
      }
    }
  }
}
```

> [!TIP]
> `nvidia/nemotron-nano-12b-v2-vl:free` is a free vision model on OpenRouter that requires no credits.

> [!NOTE]
> Any MCP server with an image analysis tool will work — the above are just examples. For a different tool, point the plugin to it using `imageAnalysisTool` — see [Configuration](#configuration).

### 2. Install the plugin

**With the OpenCode CLI (v1.3.4+):**

Global (all projects):
```bash
opencode plugin opencode-minimax-easy-vision --global
```

Project-level (current directory only):
```bash
opencode plugin opencode-minimax-easy-vision
```

**Or manually,** add it to the `plugin` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

**Or let your agent do it** — paste this into OpenCode:

```
Set up opencode-minimax-easy-vision by following https://raw.githubusercontent.com/devadathanmb/opencode-minimax-easy-vision/main/README.md
```

<details>
<summary><b>For LLM Agents</b></summary>

Set up this plugin interactively by asking the user the questions below in order. Use their answers to build the correct configuration, then apply it.

> **Before modifying any file:** check whether it already exists and whether the relevant block or key is already present. If it is, update it in place rather than replacing the whole file.

---

### Question 1 — Which MCP image analysis tool?

Ask the user:

> Which MCP image analysis tool would you like to use for image analysis?
> 1. **MiniMax Coding Plan MCP** — official MiniMax tool
> 2. **openrouter-image-mcp** — routes through OpenRouter, includes free vision models
> 3. **Something else** — I already have one, or I want to use a different tool

**If they choose 1 (MiniMax Coding Plan MCP):**

Check whether `~/.config/opencode/opencode.json` already has an `mcp` block. If it does, add the `MiniMax` entry to the existing block. If not, create the block.

Ask for their MiniMax API key — they can get one at https://platform.minimax.io.

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

The tool name this server exposes is `mcp_minimax_understand_image` — note this for Question 3.

**If they choose 2 (openrouter-image-mcp):**

Check whether `~/.config/opencode/opencode.json` already has an `mcp` block. If it does, add the `openrouter_image` entry to the existing block. If not, create the block.

Ask for their OpenRouter API key — they can get one at https://openrouter.ai/keys. Ask which vision model they want to use; if they're unsure, `nvidia/nemotron-nano-12b-v2-vl:free` is free and requires no credits.

```json
"openrouter_image": {
  "type": "local",
  "command": ["npx", "openrouter-image-mcp"],
  "environment": {
    "OPENROUTER_API_KEY": "<their key>",
    "OPENROUTER_MODEL": "nvidia/nemotron-nano-12b-v2-vl:free"
  }
}
```

Ask the user what tool name this MCP server exposes (check its README or run `opencode -c` after restarting) — note it for Question 3.

**If they choose 3 (something else):**

Ask the user to describe the tool or provide its name/repo. Search for its setup documentation. Then:
- Help them add the correct `mcp` entry to `~/.config/opencode/opencode.json`, checking first whether the block already exists
- Ask the user what tool name the server exposes, or help them find it — note it for Question 3

---

### Question 2 — Which models should the plugin activate for?

Ask the user:

> Which models should this plugin activate for?
> 1. **MiniMax provider models only** (default — model IDs like `minimax/text-01`, `minimax-cn/*`, etc. where MiniMax is the direct provider in OpenCode)
> 2. **All models**
> 3. **Specific model(s)** — I'll tell you which ones

> **Note:** The default does NOT cover MiniMax models accessed through a third-party provider. For example, if the user is calling a MiniMax model via OpenRouter, they need to choose option 2 or 3 and provide the OpenRouter model ID pattern.

**If they choose 1:** No plugin config file is needed — this is the default. Skip to Step 3.

**If they choose 2:**

Check whether `~/.config/opencode/opencode-minimax-easy-vision.jsonc` already exists. If it does, update the `models` key. If not, create it:

```jsonc
{
  "models": ["*"]
}
```

**If they choose 3:** Ask which model IDs or patterns. Check whether the config file already exists and update or create accordingly:

```jsonc
{
  // Each entry is a glob matched against the full model ID (e.g. "openai/gpt-4o", "openrouter/minimax-text-01")
  "models": ["*their-model*"]
}
```

See https://raw.githubusercontent.com/devadathanmb/opencode-minimax-easy-vision/main/CONFIGURATION.md for the full config reference and pattern syntax.

---

### Question 3 — MCP tool name

If the tool name noted in Question 1 is anything other than `mcp_minimax_understand_image` (the built-in default), add `imageAnalysisTool` to the plugin config file. Check whether `~/.config/opencode/opencode-minimax-easy-vision.jsonc` already exists and update or create accordingly:

```jsonc
{
  "imageAnalysisTool": "<tool name from Question 1>"
}
```

If the tool name is `mcp_minimax_understand_image`, skip this step.

---

### Step 3 — Add the plugin

Check whether `~/.config/opencode/opencode.json` already has a `plugin` array. If it does and `"opencode-minimax-easy-vision"` is already in it, skip this step. Otherwise add it:

```json
{
  "plugin": ["opencode-minimax-easy-vision"]
}
```

---

### Step 4 — Restart and verify

Tell the user to restart OpenCode. Then ask them to paste an image (`Cmd+V` / `Ctrl+V`) into the chat with a configured model selected and send a message. The model should call the MCP image tool and return an analysis rather than ignoring the image.

If it doesn't work, check:
1. Is the tool name in `imageAnalysisTool` correct? Run `opencode -c` and look for it in the tool list.
2. Does the model ID match the configured `models` pattern? Remember: OpenRouter-served models won't match `minimax/*` even if the underlying model is from MiniMax.
3. Is the API key set correctly in the MCP environment block?

</details>

## Usage

1. Select a configured model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question — just like you would with Claude or GPT.

## Configuration

> [!IMPORTANT]
> By default, this plugin only activates for **MiniMax provider models** — i.e. models where MiniMax is the direct provider in OpenCode (IDs matching `minimax/*`, `minimax-cn/*`, etc.). If you're accessing a MiniMax model through a third-party provider like OpenRouter, or using a completely different model, the plugin won't activate until you add that model's pattern to the `models` config — see [CONFIGURATION.md](./CONFIGURATION.md).

Config files are loaded in priority order:

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json` (or `.jsonc`)
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json` (or `.jsonc`)

On first load, an example config is created at `~/.config/opencode/opencode-minimax-easy-vision.jsonc` with all options and inline comments. See [CONFIGURATION.md](./CONFIGURATION.md) for the full reference.

## Supported Image Formats

PNG, JPEG, WebP — exact formats depend on the image analysis tool you've configured.

## Troubleshooting

**Plugin not updating after a new release?**

OpenCode caches plugins under `~/.cache/opencode/packages/`. If it's still running an old version after a release, clear the cache entry and restart:

```bash
rm -rf ~/.cache/opencode/packages/opencode-minimax-easy-vision@latest
```

**Plugin not activating?**

By default the plugin only fires for MiniMax provider models (IDs matching `minimax/*`, `minimax-cn/*`, etc.). It will not activate for a MiniMax model accessed through OpenRouter or any other provider. To use the plugin with a different model or provider, add the model's ID pattern to `models` in your config — see [CONFIGURATION.md](./CONFIGURATION.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
