# OpenCode Easy Vision

An [OpenCode](https://opencode.ai) plugin that adds **vision support** to models that lack it. Paste images directly into the chat and ask questions, just like you would with Claude or GPT.

> [!IMPORTANT]
>
> **Version 2.x requires OpenCode v2** and is published under the `next` tag, so install it as `opencode-easy-vision@next`. Plain `opencode-easy-vision` still installs 1.x, for OpenCode v1. To keep v1 setups working when 2.x becomes the default, pin the 1.x release:
>
> ```json
> { "plugin": ["opencode-easy-vision@1"] }
> ```
>
> Coming from 1.x? See [Upgrading from 1.x](#upgrading-from-1x).

## Table of Contents

- [The Problem](#the-problem)
- [Demo](#demo)
- [Setup](#setup)
  - [Manual Setup](#manual-setup)
  - [Agent-Assisted Setup](#agent-assisted-setup)
- [Usage](#usage)
- [Configuration](#configuration)
- [Supported Image Formats](#supported-image-formats)
- [Troubleshooting](#troubleshooting)
- [Upgrading from 1.x](#upgrading-from-1x)
- [Uninstallation](#uninstallation)
- [Contributing](#contributing)
- [License](#license)
- [References](#references)

## The Problem

Many models, especially open-weight ones, have no vision capability. They are text-only and cannot process image input. For some models, such as MiniMax, an MCP tool can read an image through a vision service and return the analysis as text. The tool needs a local file path rather than a clipboard paste, so you would otherwise need to save each screenshot and provide its path yourself.

This plugin automates the entire workaround. It intercepts pasted images, saves them to disk, and injects the instructions the model needs to call the MCP tool with the correct path. You paste an image and ask a question. The plugin handles the rest.

## Demo

| Without the plugin | With the plugin |
| :-: | :-: |
| <img width="100%" alt="Without plugin screenshot" src="https://github.com/user-attachments/assets/eb5c76ce-e1a6-4ad0-aa51-58ce5e8efd8f" /> | <img width="100%" alt="With plugin screenshot" src="https://github.com/user-attachments/assets/b5bcaac4-8ac8-48eb-90cb-59630c26f4e1" /> |
| The image is silently ignored by the model. | The model analyzes the attached image correctly before answering. |

https://github.com/user-attachments/assets/da7d8618-5de1-4a00-9250-a91493e3ea16

https://github.com/user-attachments/assets/fdb68339-b95b-46eb-90d4-ac2dbc0f436e

## Setup

### Manual Setup

#### 1. Configure an MCP image analysis tool

The plugin works with any MCP server that can analyze an image from a local path or URL and return its analysis as text. Add one to your `opencode.json`.

**Default: MiniMax Coding Plan MCP**

```json
{
  "mcp": {
    "servers": {
      "MiniMax": {
        "type": "local",
        "command": ["uvx", "minimax-coding-plan-mcp"],
        "environment": {
          "MINIMAX_API_KEY": "{env:MINIMAX_API_KEY}",
          "MINIMAX_API_HOST": "https://api.minimax.io"
        }
      }
    }
  }
}
```

**Alternative: [openrouter-image-mcp](https://github.com/JonathanJude/openrouter-image-mcp)**

Routes image analysis through OpenRouter, giving you access to any vision-capable model including free ones.

```json
{
  "mcp": {
    "servers": {
      "openrouter_image": {
        "type": "local",
        "command": ["npx", "openrouter-image-mcp"],
        "environment": {
          "OPENROUTER_API_KEY": "{env:OPENROUTER_API_KEY}",
          "OPENROUTER_MODEL": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
        }
      }
    }
  }
}
```

> [!TIP]
>
> `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` is a free multimodal model designed for image perception and reasoning. Free model availability changes over time, so check [OpenRouter's free models](https://openrouter.ai/models?fmt=cards&max_price=0) for current alternatives. Free endpoints use shared capacity and may respond more slowly or time out under load. When using this server, set `imageAnalysisTool` to `openrouter_image_analyze_image` in the plugin config.

> [!NOTE]
>
> Any MCP server with an image analysis tool will work. The servers above are examples. For a different tool, set `imageAnalysisTool`; see [Configuration](#configuration).

> [!NOTE]
>
> OpenCode v2 hides MCP tools behind **Code Mode** by default, so the model can only reach them by writing code for an `execute` tool. The plugin turns Code Mode off for the server that provides the vision tool, so the model can call it directly. Other servers are left alone, and a `codemode` value you set on that server always wins. See [`disableCodeMode`](./CONFIGURATION.md#disablecodemode).

#### 2. Install the plugin

Install it for all projects with the OpenCode CLI:

```bash
opencode plugin add opencode-easy-vision@next
```

Or add it to the `plugins` array in your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-easy-vision@next"]
}
```

To work on a local checkout, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

### Agent-Assisted Setup

**Paste this into OpenCode and let your agent handle the rest:**

```
Set up opencode-easy-vision by following https://raw.githubusercontent.com/devadathanmb/opencode-easy-vision/main/AGENT_SETUP.md
```

<details>
<summary><b>What the agent will do</b></summary>

The agent follows the instructions in [AGENT_SETUP.md](./AGENT_SETUP.md). It will:

1. Inspect your existing OpenCode and plugin configuration
2. Ask whether to set up the plugin for all projects or only the current project
3. Ask which MCP image analysis tool and models you want to use
4. Update existing files in place instead of replacing them
5. Summarize the changes and guide you through verification after a restart

</details>

## Usage

1. Select a configured model in OpenCode.
2. Paste an image (`Cmd+V` / `Ctrl+V`).
3. Ask your question, just like you would with Claude or GPT.

## Configuration

> [!IMPORTANT]
>
> By default, this plugin only activates for **MiniMax provider models**, where MiniMax is the direct provider in OpenCode. These IDs match `minimax/*`, `minimax-cn/*`, and related patterns. If you access a MiniMax model through a third-party provider such as OpenRouter, or use another model, add that model's pattern to `models`. See [CONFIGURATION.md](./CONFIGURATION.md).

Each option uses the following priority order:

1. **Project level**: `.opencode/opencode-easy-vision.jsonc`
2. **User level**: `~/.config/opencode/opencode-easy-vision.jsonc`

On first load, an example config is created at `~/.config/opencode/opencode-easy-vision.jsonc`. See [CONFIGURATION.md](./CONFIGURATION.md) for config precedence and the full option reference.

## Supported Image Formats

PNG, JPEG, and WebP. Exact format support depends on the image analysis tool you configure.

## Troubleshooting

**Plugin not activating?**

By default, the plugin only activates for MiniMax provider models, with IDs matching `minimax/*`, `minimax-cn/*`, and related patterns. It does not activate for a MiniMax model accessed through OpenRouter or another provider. To use the plugin with a different model or provider, add the model's ID pattern to `models` in your config. See [CONFIGURATION.md](./CONFIGURATION.md).

**Model says the vision tool is unavailable?**

OpenCode names MCP tools `<server>_<tool>`, so the `MiniMax` server above exposes `MiniMax_understand_image`. Make sure `imageAnalysisTool` matches that name exactly (it is case-sensitive) and that the MCP server is connected.

**Plugin not updating after a new release?**

Run `opencode plugin update`. OpenCode v2 runs plugins in a background service, so restarting the terminal is not enough: run `opencode service restart` to load the new version.

**Using a remote or containerized MCP server?**

Images are saved on the machine running OpenCode. The MCP server must be able to read files at those paths.

**Where are the logs?**

In OpenCode's log file (`~/.local/share/opencode/log/opencode.log` by default), on lines tagged `plugin=easy-vision`.

## Upgrading from 1.x

1. Upgrade to OpenCode v2, then change your plugin entry to `opencode-easy-vision@next`. The old `"plugin"` key still works, though `"plugins"` is the v2 key.
2. OpenCode v2 names MCP tools differently. If your config sets `imageAnalysisTool` to `mcp_minimax_understand_image`, remove it to use the new default, `MiniMax_understand_image`, or set it to your server's `<server>_<tool>` name.
3. Config files must now be named `opencode-easy-vision.jsonc`. Rename any `opencode-easy-vision.json` or `opencode-minimax-easy-vision.json(c)` files; their contents do not need to change.

## Uninstallation

1. Run `opencode plugin remove opencode-easy-vision`, or remove it from the `plugins` array in your `opencode.json`.

2. Delete the plugin config files you no longer need:

```bash
rm -f ~/.config/opencode/opencode-easy-vision.jsonc
rm -f .opencode/opencode-easy-vision.jsonc
```

Saved images live in `opencode-easy-vision/` in your OS temp directory (or your configured `tempDir`) and are cleaned up automatically.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local development setup.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## References

- [OpenCode Official Website](https://opencode.ai)
- [OpenCode V2 Plugins Documentation](https://opencode.ai/v2/docs/build/plugins)
- [MiniMax Coding Plan MCP Repository](https://github.com/MiniMax-AI/MiniMax-Coding-Plan-MCP)
- [openrouter-image-mcp Repository](https://github.com/JonathanJude/openrouter-image-mcp)
