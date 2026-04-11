# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to models that lack it — paste images directly into the chat and ask questions, just like you would with Claude or GPT.

## Table of Contents

* [Demo](#demo)
* [The Problem](#the-problem)
* [Setup](#setup)
  * [1. Configure an MCP image analysis tool](#1-configure-an-mcp-image-analysis-tool)
  * [2. Install the plugin](#2-install-the-plugin)
* [Configuration](#configuration)
  * [Model Patterns](#model-patterns)
  * [Image Analysis Tool](#image-analysis-tool)
  * [Prompt Template](#prompt-template)
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
> Any MCP server with an image analysis tool will work — the above are just examples. For a different tool, add it to `opencode.json` the same way, then point the plugin to it using `imageAnalysisTool` — see [Image Analysis Tool](#image-analysis-tool).

### 2. Install the plugin

Add `opencode-minimax-easy-vision` to the `plugin` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

## Configuration

> [!IMPORTANT]
> By default, this plugin only activates for **MiniMax models**. If you're using a different model and nothing is happening, configure the plugin to activate for that model — see [Model Patterns](#model-patterns) below.

Config files are loaded in priority order:

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json`
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json`

### Model Patterns

Control which models the plugin activates for:

```json
{
  "models": ["z-ai/*", "*/some-model"]
}
```

| Pattern          | Matches                                    |
| ---------------- | ------------------------------------------ |
| `*`              | All models                                 |
| `z-ai/*`         | All models from a specific provider        |
| `*/some-model`   | A specific model from any provider         |
| `z-ai/glm-4.7`   | Exact match                                |

If no config file exists, the plugin defaults to MiniMax models.

### Image Analysis Tool

By default the plugin uses `mcp_minimax_understand_image` from the MiniMax Coding Plan MCP. To use a different tool, set `imageAnalysisTool` to the tool name. The name follows the format `mcp_<server-key>_<tool>`, where `<server-key>` is the key you used when adding the server to the `mcp` object in `opencode.json`:

```json
{
  "models": ["z-ai/*"],
  "imageAnalysisTool": "mcp_openrouter_image_analyze_image"
}
```

### Prompt Template

Override the default injection prompt with a custom template:

```json
{
  "promptTemplate": "I'm attaching {imageCount} image(s) for you to analyze.\n\nImages:\n{imageList}\n\nUse the `{toolName}` tool on each one.\n\nMy question: {userText}"
}
```

| Variable       | Description                                             |
| -------------- | ------------------------------------------------------- |
| `{imageList}`  | Newline-separated list: `- Image 1: /path/to/file`     |
| `{imageCount}` | Number of images, e.g. `1`, `3`                        |
| `{toolName}`   | The configured MCP tool name                           |
| `{userText}`   | The user's original message text (may be empty)        |

The template must include at least one variable — if none are present, the plugin falls back to the default prompt.

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
