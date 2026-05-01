# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to models that lack it — paste images directly into the chat and ask questions, just like you would with Claude or GPT.

## Table of Contents

* [Demo](#demo)
* [The Problem](#the-problem)
* [Setup](#setup)
  * [1. Configure an MCP image analysis tool](#1-configure-an-mcp-image-analysis-tool)
  * [2. Install the plugin](#2-install-the-plugin)
* [Configuration](#configuration)
* [Supported Image Formats](#supported-image-formats)
* [Usage](#usage)
* [Contributing](#contributing)
* [License](#license)
* [References](#references)

## Demo

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## The Problem

Many models — open-weight ones especially — have no vision capability. They are text-only and simply cannot process image input. For some of these models (like MiniMax), a workaround exists: an MCP tool that reads the image externally using a vision service and returns the analysis as text the model can use. But this workaround itself has a catch, which creates two problems:

**1. No vision capability** — The model cannot process images. Paste one into the chat and it's silently ignored.

**2. The MCP workaround needs a file path** — The MCP image tool requires a local file path or URL to read from — not a clipboard paste. Without automation, every time you want to share a screenshot you have to save it manually, find the path, and type it into your message.

This plugin automates the entire workaround. It intercepts pasted images, saves them to disk automatically, and injects the right instructions for the model to call the MCP tool with the correct path. You paste, you ask — the plugin handles the rest.

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

**Alternative example — [openrouter-image-mcp](https://github.com/JonathanJude/openrouter-image-mcp):**

This routes image analysis through OpenRouter, giving you access to any vision-capable model including free ones.

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
> Any MCP server with an image analysis tool will work — the above are just examples. For a different tool, add it to `opencode.json` the same way, then point the plugin to it using `imageAnalysisTool` — see [Configuration](#configuration).

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

## Configuration

> [!IMPORTANT]
> By default, this plugin only activates for **MiniMax models**. If you're using a different model and nothing is happening, configure the plugin to activate for that model — see [CONFIGURATION.md](./CONFIGURATION.md).

Config files are loaded in priority order:

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json` (or `.jsonc`)
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json` (or `.jsonc`)

If no config file exists, the plugin uses hardcoded defaults. On first load, an example config file is created at `~/.config/opencode/opencode-minimax-easy-vision.jsonc`.

See [CONFIGURATION.md](./CONFIGURATION.md) for all available options, model pattern syntax, prompt template variables, and example configs.

## Supported Image Formats

PNG, JPEG, WebP — exact formats depend on the image analysis tool you've configured.

## Usage

1. Select a configured model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question — just like you would with Claude or GPT.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
