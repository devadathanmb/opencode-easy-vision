# Opencode MiniMax Easy Vision

MiniMax Easy Vision is a plugin for [OpenCode](https://opencode.ai) that enables **vision support** for models that lack native image attachment support.

Originally built for [MiniMax](https://www.minimax.io/) models, it can be configured to work with any model that requires MCP-based image handling.

It restores the "paste and ask" workflow by automatically saving image assets and routing them through the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)

## Table of Contents

* [Demo](#demo)
* [The Problem](#the-problem)
* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [What This Plugin Does](#what-this-plugin-does)
* [Supported Models](#supported-models)
  * [Custom Model Configuration](#custom-model-configuration)
    * [Locations (Priority Order)](#locations-priority-order)
    * [Config Format](#config-format)
    * [Pattern Syntax](#pattern-syntax)
    * [Wildcard Rules](#wildcard-rules)
    * [Configuration Examples](#configuration-examples)
  * [Custom Image Analysis Tool](#custom-image-analysis-tool)
  * [Custom Prompt Template](#custom-prompt-template)
* [Supported Image Formats](#supported-image-formats)
* [Usage](#usage)
  * [Example Interaction](#example-interaction)
* [Development](#development)
* [License](#license)
* [References](#references)

## Demo

See how it works:

https://github.com/user-attachments/assets/df396c6c-6fa8-46b8-8984-c003ecf1c12c

https://github.com/user-attachments/assets/826f90ea-913f-427e-ace8-0b711302c497

## The Problem

When using MiniMax models (like MiniMax M2.1) in OpenCode, native image attachments aren't supported. 

These models expect the MiniMax Coding Plan MCP's `understand_image` tool, which requires an explicit file path. This breaks the normal flow:

* **Ignored images**: Pasted images are simply ignored by the model.
* **Manual steps**: You have to save screenshots manually, find the path, and reference it in your prompt.
* **Broken flow**: The "paste and ask" experience available with Claude or GPT models is lost.

## Prerequisites

The MiniMax Coding Plan MCP server must be configured in your `opencode.json`:

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

## Installation

Add the plugin to the `plugin` array in your `opencode.json` file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-minimax-easy-vision"]
}
```

## What This Plugin Does

This plugin automates the vision pipeline so you don't have to think about it.

**How it works:**

1. **Detects** when a configured model is active.
2. **Intercepts** images pasted into the chat.
3. **Saves** them to a temporary local directory.
4. **Injects** the necessary context for the model to invoke the `understand_image` tool with the correct path.

**Result:** You just paste the image and ask your question just like how you do with Claude or GPT models. The plugin handles the rest.

## Supported Models

By default, the plugin activates for MiniMax models using the patterns `["minimax/*", "*/abab*"]`:

* `minimax/*` — all models from the `minimax` provider
* `*/abab*` — any model whose ID contains `abab`, regardless of provider

**Examples:**
* `minimax/minimax-m2.1`
* `minimax/abab6.5s-chat`

### Custom Model Configuration

You can enable this for other models by creating a config file.

#### Locations (Priority Order)

1. **Project level**: `.opencode/opencode-minimax-easy-vision.json`
2. **User level**: `~/.config/opencode/opencode-minimax-easy-vision.json`

#### Config Format

```json
{
  "models": ["minimax/*", "opencode/*", "*/glm-4.7-free"]
}
```

#### Pattern Syntax

| Pattern          | Matches                                 |
| ---------------- | --------------------------------------- |
| `*`              | Match ALL models                        |
| `minimax/*`      | All models from the `minimax` provider  |
| `*/glm-4.7-free` | Specific model from any provider        |
| `opencode/*`     | All models from the `opencode` provider |
| `*/abab*`        | Any model containing `abab`             |

#### Wildcard Rules

* `*suffix` matches values ending with `suffix`
* `prefix*` matches values starting with `prefix`
* `*` matches everything
* `*text*` matches values containing `text`

If the config is missing or empty, it defaults to `["minimax/*", "*/abab*"]`.

#### Configuration Examples

**Enable for all models:**

```json
{
  "models": ["*"]
}
```

**Specific providers:**

```json
{
  "models": ["minimax/*", "opencode/*", "google/*"]
}
```

**Mix of providers and models:**

```json
{
  "models": ["minimax/*", "opencode/gpt-5-nano", "*/claude-3-7-sonnet*"]
}
```

### Custom Image Analysis Tool

By default, the plugin uses the `mcp_minimax_understand_image` tool from the MiniMax Coding Plan MCP. You can configure a different tool for image analysis.

> [!NOTE]
> The `imageAnalysisTool` value is the **tool name**, not the MCP server name.
>
> MCP servers expose one or more tools—for example, the MiniMax Coding Plan MCP server exposes the
> `mcp_minimax_understand_image` tool. OpenCode prefixes tool names with `mcp_<server-name>_`.

#### Example: openrouter-image-mcp

[openrouter-image-mcp](https://github.com/JonathanJude/openrouter-image-mcp) routes image analysis through OpenRouter, giving you access to any vision-capable model including free ones.

Add the MCP server to your `opencode.json`:

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

Then configure the plugin to use it:

```json
{
  "models": ["minimax/*"],
  "imageAnalysisTool": "mcp_openrouter_image_analyze_image"
}
```

> [!TIP]
> `nvidia/nemotron-nano-12b-v2-vl:free` is a free vision model on OpenRouter that requires no credit card. Get a free API key at [openrouter.ai](https://openrouter.ai).

### Custom Prompt Template

By default, the plugin generates a fixed instruction prompt telling the model to use the image analysis tool. You can override this with a custom template:

```json
{
  "promptTemplate": "I'm attaching {imageCount} image(s) for you to analyze.\n\nImages:\n{imageList}\n\nUse the `{toolName}` tool on each one.\n\nMy question: {userText}"
}
```

#### Available Variables

| Variable | Description |
| -------------- | --------------------------------------------- |
| `{imageList}` | Newline-separated list: `- Image 1: /path/to/file` |
| `{imageCount}` | Number of images, e.g. `1`, `3` |
| `{toolName}` | The configured MCP tool name |
| `{userText}` | The user's original message text (may be empty) |

The template must contain at least one variable — if none are present, the plugin falls back to the default prompt.

## Supported Image Formats

* PNG
* JPEG
* WebP

*(Limited by the [MiniMax Coding Plan MCP](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP) `understand_image` tool.)*

## Usage

1. Select a supported model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask a question about it, just like how you do for other models with native vision support.

### Example Interaction

> **You**: [pasted screenshot] Why is this failing?
>
> **Model**: I'll check the image using the `understand_image` tool.
> `[Calls mcp_minimax_understand_image path="/tmp/xyz.png"]`
> 
> **Model**: The error suggests a syntax error on line 12.

## Development

1. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
2. The built plugin will be available at `dist/index.js`.
3. Symlink it into the global plugin directory and restart OpenCode to pick up changes:
   ```bash
   mkdir -p ~/.config/opencode/plugin
   ln -sf $(pwd)/dist/index.js ~/.config/opencode/plugin/minimax-easy-vision.js
   ```

## License

AGPL-3.0. See [LICENSE](./LICENSE)

## References

* [OpenCode Official Website](https://opencode.ai)
* [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
* [MiniMax Official Website](https://www.minimax.io/)
* [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
* [MiniMax API Documentation](https://platform.minimax.io/docs/guides/coding-plan-mcp-guide)
