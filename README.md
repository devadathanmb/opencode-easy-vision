# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to models that lack it — paste images directly into the chat and ask questions, just like you would with Claude or GPT.

> [!IMPORTANT]
>
> **Renamed from `opencode-minimax-easy-vision`:** Existing users only need to replace the old package name in the `plugin` array with `opencode-easy-vision`. Existing plugin configuration continues to work; no other migration is required.

## Table of Contents

- [The Problem](#the-problem)
- [Demo](#demo)
- [Setup](#setup)
  - [For Humans](#for-humans)
  - [For LLM Agents](#for-llm-agents)
- [Usage](#usage)
- [Configuration](#configuration)
- [Supported Image Formats](#supported-image-formats)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)
- [Contributing](#contributing)
- [License](#license)
- [References](#references)

## The Problem

Many models — open-weight ones especially — have no vision capability. They are text-only and simply cannot process image input. For some (like MiniMax), a workaround exists: an MCP tool that reads the image externally using a vision service and returns the analysis as text. But that tool requires a local file path, not a clipboard paste — meaning you'd have to save every screenshot manually, find the path, and type it in.

This plugin automates the entire workaround. It intercepts pasted images, saves them to disk, and injects the right instructions for the model to call the MCP tool with the correct path. You paste, you ask — the plugin handles the rest.

## Demo

| Without the plugin | With the plugin |
| :-: | :-: |
| <img width="100%" alt="Without plugin screenshot" src="https://github.com/user-attachments/assets/eb5c76ce-e1a6-4ad0-aa51-58ce5e8efd8f" /> | <img width="100%" alt="With plugin screenshot" src="https://github.com/user-attachments/assets/b5bcaac4-8ac8-48eb-90cb-59630c26f4e1" /> |
| The image is silently ignored by the model. | The model analyzes the attached image correctly before answering. |


https://github.com/user-attachments/assets/da7d8618-5de1-4a00-9250-a91493e3ea16

https://github.com/user-attachments/assets/fdb68339-b95b-46eb-90d4-ac2dbc0f436e

## Setup

### For Humans

#### 1. Configure an MCP image analysis tool

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
>
> `nvidia/nemotron-nano-12b-v2-vl:free` is a free vision model on OpenRouter that requires no credits. When using this server, set `imageAnalysisTool` to `openrouter_image_analyze_image` in the plugin config.

> [!NOTE]
>
> Any MCP server with an image analysis tool will work — the above are just examples. For a different tool, point the plugin to it using `imageAnalysisTool` — see [Configuration](#configuration).

#### 2. Install the plugin

**With the OpenCode CLI (v1.3.4+):**

Global (all projects):

```bash
opencode plugin opencode-easy-vision --global
```

Project-level (current directory only):

```bash
opencode plugin opencode-easy-vision
```

**Or manually,** add it to the `plugin` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-easy-vision"]
}
```

---

### For LLM Agents

**Paste this into OpenCode and let your agent handle the rest:**

```
Set up opencode-easy-vision by following https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/AGENT_SETUP.md
```

<details>
<summary><b>What the agent will do</b></summary>

The agent follows the instructions in [AGENT_SETUP.md](./AGENT_SETUP.md). It will:

1. Pre-fetch your existing config and the full configuration reference before asking anything
2. Ask which MCP image analysis tool you want (MiniMax, OpenRouter, or something else) and collect the relevant API key
3. Ask which models the plugin should activate for
4. Apply all changes — updating existing files in place rather than replacing them
5. Walk you through verifying the setup after a restart

</details>

## Usage

1. Select a configured model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question — just like you would with Claude or GPT.

## Configuration

> [!IMPORTANT]
>
> By default, this plugin only activates for **MiniMax provider models** — i.e. models where MiniMax is the direct provider in OpenCode (IDs matching `minimax/*`, `minimax-cn/*`, etc.). If you're accessing a MiniMax model through a third-party provider like OpenRouter, or using a completely different model, the plugin won't activate until you add that model's pattern to the `models` config — see [CONFIGURATION.md](./CONFIGURATION.md).

Config files are loaded in priority order:

1. **Project level**: `.opencode/opencode-easy-vision.json` (or `.jsonc`)
2. **User level**: `~/.config/opencode/opencode-easy-vision.json` (or `.jsonc`)

On first load, an example config is created at `~/.config/opencode/opencode-easy-vision.jsonc`. See [CONFIGURATION.md](./CONFIGURATION.md) for the full reference.

## Supported Image Formats

PNG, JPEG, WebP — exact formats depend on the image analysis tool you've configured.

## Troubleshooting

**Plugin not updating after a new release?**

OpenCode caches plugins under `~/.cache/opencode/packages/`. If it's still running an old version after a release, clear the cache entry and restart:

```bash
rm -rf ~/.cache/opencode/packages/opencode-easy-vision@latest
```

**Plugin not activating?**

By default the plugin only fires for MiniMax provider models (IDs matching `minimax/*`, `minimax-cn/*`, etc.). It will not activate for a MiniMax model accessed through OpenRouter or any other provider. To use the plugin with a different model or provider, add the model's ID pattern to `models` in your config — see [CONFIGURATION.md](./CONFIGURATION.md).

## Uninstallation

1. Remove `opencode-easy-vision` from the `plugin` array in your `opencode.json` file.

2. Delete the config files the plugin created:

```bash
rm -f ~/.config/opencode/opencode-easy-vision.{json,jsonc}
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

- [OpenCode Official Website](https://opencode.ai)
- [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
- [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
- [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
