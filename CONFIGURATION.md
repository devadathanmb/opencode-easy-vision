# Configuration

This plugin reads its configuration from dedicated `opencode-easy-vision.jsonc` files (JSON with comments and trailing commas). See [Config File Locations](#config-file-locations) for where to place them.

Options set inline in OpenCode's `plugins` array are not read.

## Table of Contents

- [Config File Locations](#config-file-locations)
- [Config Options](#config-options)
  - [`models`](#models)
  - [`imageAnalysisTool`](#imageanalysistool)
  - [`promptTemplate`](#prompttemplate)
  - [`tempDir`](#tempdir)
  - [`cleanupAfterHours`](#cleanupafterhours)
  - [`disableCodeMode`](#disablecodemode)
- [Full Example Configs](#full-example-configs)

## Config File Locations

Each config option uses the following priority (highest first):

| Priority | Level | Path |
| --- | --- | --- |
| 1 | Project | `.opencode/opencode-easy-vision.jsonc` |
| 2 | User | `~/.config/opencode/opencode-easy-vision.jsonc` |

The plugin merges options across levels. For example, a project `models` setting overrides the user setting while the user-level `imageAnalysisTool` remains in effect when the project config does not set it.

`opencode-easy-vision.json` and the old `opencode-minimax-easy-vision.json(c)` filenames are no longer read; rename them to `opencode-easy-vision.jsonc`. Plain JSON is valid JSONC, so the contents do not need to change.

If no config exists, the plugin uses hardcoded defaults. On first load, an example `.jsonc` file is created at `~/.config/opencode/opencode-easy-vision.jsonc`.

## Config Options

### `models`

**Type:** `string[]`  
**Default:**

```json
[
  "minimax/*",
  "minimax-cn/*",
  "minimax-coding-plan/*",
  "minimax-cn-coding-plan/*",
  "minimax-token-plan/*",
  "minimax-cn-token-plan/*"
]
```

Controls which models trigger the plugin. The format is `provider/model` with wildcard support:

| Pattern          | Matches                                |
| ---------------- | -------------------------------------- |
| `*`              | All models                             |
| `minimax/*`      | All models from the `minimax` provider |
| `*/minimax-m2.5` | The specific model from any provider   |
| `z-ai/glm-4.7`   | Exact match                            |

Patterns without a `/` are matched against both the provider ID and the model ID.

Matching is case-insensitive. The pattern splits at the first `/`, so `openrouter/deepseek/*` matches model `deepseek/deepseek-v4-flash` from provider `openrouter`.

**Example:**

```json
{
  "models": ["z-ai/*", "*/some-model"]
}
```

### `imageAnalysisTool`

**Type:** `string`  
**Default:** `"MiniMax_understand_image"`

The MCP tool the plugin instructs the model to use. Use the exact tool name OpenCode exposes.

OpenCode names MCP tools `<server>_<tool>`, replacing characters other than letters, digits, `_` and `-` in the server name with `_`. The default comes from server `MiniMax` and tool `understand_image`. The name is case-sensitive. The 1.x default, `mcp_minimax_understand_image`, no longer works.

If the tool is not available in a request, for example because the server is disconnected, the model is told so instead of being asked to call it.

**Example:**

```json
{
  "imageAnalysisTool": "openrouter_image_analyze_image"
}
```

### `promptTemplate`

**Type:** `string`  
**Default:** built-in template (see below)

Override the default prompt with a custom template. The template must include **at least one** of the following variables. If none are present, the plugin falls back to the default. Include both `{imageList}` and `{toolName}` when the model needs the image paths and the MCP tool name.

The prompt is added to the latest user message only; images in earlier messages are replaced by their saved paths. If the tool is behind Code Mode, a note on reaching it through `execute` is appended.

| Variable       | Description                                        |
| -------------- | -------------------------------------------------- |
| `{imageList}`  | Newline-separated list: `- Image 1: /path/to/file` |
| `{imageCount}` | Number of images, e.g. `1`, `3`                    |
| `{toolName}`   | The configured MCP tool name                       |
| `{userText}`   | The text the user typed (may be empty)             |

**Default template:**

```text
The user has shared {imageCount} image(s). The image(s) are saved at:
{imageList}

Use the `{toolName}` tool to analyze each image.

User's request: {userText}
```

**Example custom template:**

```json
{
  "promptTemplate": "I'm attaching {imageCount} image(s) for you to analyze.\n\nImages:\n{imageList}\n\nUse the `{toolName}` tool on each one.\n\nMy question: {userText}"
}
```

### `tempDir`

**Type:** `string`  
**Default:** OS temp directory + `opencode-easy-vision/`

Custom directory where pasted images are saved before being passed to the MCP tool.

The directory is on the machine running OpenCode, so the MCP server must be able to read it. Files are named by a hash of their contents and are readable only by your user.

**Example:**

```json
{
  "tempDir": "/tmp/my-custom-vision-dir"
}
```

### `cleanupAfterHours`

**Type:** `number`  
**Default:** `24`

Temp files older than this many hours are deleted when the plugin initializes. The plugin does not delete files on a timer while OpenCode is running.

Only files the plugin created are deleted: names that are a 64-character hex hash with a `.png`, `.jpg` or `.webp` extension.

**Example:**

```json
{
  "cleanupAfterHours": 48
}
```

### `disableCodeMode`

**Type:** `boolean`  
**Default:** `true`

OpenCode v2 hides MCP tools behind Code Mode by default: the model cannot call them directly and has to write code for an `execute` tool instead. When this option is `true`, the plugin sets `codemode: false` on the MCP server that provides [`imageAnalysisTool`](#imageanalysistool), so the model can call the tool directly. Only that server is changed, and only if you have not set its `codemode` yourself.

If the tool name could belong to more than one server (for example, servers `foo` and `foo_bar` with tool `foo_bar_tool`), the plugin changes nothing and logs a message. Set `codemode: false` on the right server yourself.

Set this option to `false` to leave Code Mode alone. The prompt then tells the model to reach the tool through `execute`.

**Example:**

```json
{
  "disableCodeMode": false
}
```

## Full Example Configs

### Minimal — just change the models

```json
{
  "models": ["z-ai/*"]
}
```

### Use OpenRouter for image analysis

```json
{
  "models": ["z-ai/*"],
  "imageAnalysisTool": "openrouter_image_analyze_image"
}
```

### Custom prompt + custom temp dir

```json
{
  "models": ["*"],
  "promptTemplate": "Analyze these {imageCount} images using `{toolName}`:\n{imageList}\n\nUser asked: {userText}",
  "tempDir": "/tmp/vision",
  "cleanupAfterHours": 48
}
```
