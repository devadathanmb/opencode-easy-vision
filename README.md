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

## Usage

1. Select a configured model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question — just like you would with Claude or GPT.

## Configuration

> [!IMPORTANT]
> By default, this plugin only activates for **MiniMax models**. If you're using a different model and nothing is happening, configure the plugin to activate for that model — see [CONFIGURATION.md](./CONFIGURATION.md).

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

The plugin only fires for models matching its configured pattern (MiniMax by default). If you're on a different model, add it to the `models` list in your config — see [CONFIGURATION.md](./CONFIGURATION.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
