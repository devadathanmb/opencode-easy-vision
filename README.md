# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** — paste images directly into the chat and ask questions about them, with any model.

Many models — especially newer and open-weight ones — don't support native image attachments. They can analyze images, but only through an explicit MCP tool call with a file path, not through direct attachment. This plugin bridges that gap: it intercepts pasted images, saves them locally, and routes them through an MCP image analysis tool — restoring the seamless paste-and-ask workflow you'd expect.

## Table of Contents

* [Demo](#demo)
* [The Problem](#the-problem)
* [Setup](#setup)
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

Some models can analyze images, but only when given an explicit file path through an MCP tool — not through direct attachment. Without this plugin, this breaks the normal chat flow:

* **Ignored images**: Pasted images are silently dropped.
* **Manual steps**: You have to save the screenshot, locate the path, and reference it manually.
* **Broken flow**: The seamless paste-and-ask experience you get with Claude or GPT is lost.

This plugin automates all of that. You paste, you ask — the plugin handles the rest.

## Setup

### 1. Configure an MCP image analysis tool

The plugin works with any MCP server that exposes an image analysis tool. Add one to your `opencode.json`.

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

Any MCP server with an image analysis tool will work — the above are just examples.

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
> By default, this plugin only activates for **MiniMax models**. If you're using a different model and nothing is happening, you need to configure the plugin to include that model — see [Model Patterns](#model-patterns) below.

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

By default the plugin uses `mcp_minimax_understand_image` from the MiniMax Coding Plan MCP. To use a different tool, set `imageAnalysisTool` to the tool name as it appears in OpenCode (prefixed as `mcp_<server-name>_<tool>`):

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

PNG, JPEG, WebP — exact formats supported depend on the image analysis tool you've configured.

## Usage

1. Select a supported model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question, just like any model with native vision support.

### Example Interaction

> **You**: [pasted screenshot] Why is this failing?
>
> **Model**: I'll check the image using the `understand_image` tool.
> `[Calls mcp_minimax_understand_image path="/tmp/xyz.png"]`
>
> **Model**: The error suggests a syntax error on line 12.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
