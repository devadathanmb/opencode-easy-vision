# Configuration

This plugin reads its configuration from dedicated `.json` or `.jsonc` files. See [Config File Locations](#config-file-locations) for where to place them.

## Table of Contents

* [Config File Locations](#config-file-locations)
* [Config Options](#config-options)
  * [`models`](#models)
  * [`imageAnalysisTool`](#imageanalysistool)
  * [`promptTemplate`](#prompttemplate)
  * [`tempDir`](#tempdir)
  * [`cleanupAfterHours`](#cleanupafterhours)
* [Full Example Configs](#full-example-configs)

## Config File Locations

Files are loaded in the following priority (highest first):

| Priority | Level | Path |
|----------|-------|------|
| 1 | Project | `.opencode/opencode-minimax-easy-vision.json` or `.jsonc` |
| 2 | User | `~/.config/opencode/opencode-minimax-easy-vision.json` or `.jsonc` |

If neither file exists, the plugin uses hardcoded defaults. On first load, an example `.jsonc` file is created at `~/.config/opencode/opencode-minimax-easy-vision.jsonc`.

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

| Pattern | Matches |
|---------|---------|
| `*` | All models |
| `minimax/*` | All models from the `minimax` provider |
| `*/minimax-m2.5` | The specific model from any provider |
| `z-ai/glm-4.7` | Exact match |

Patterns without a `/` are matched against both the provider ID and the model ID.

**Example:**

```json
{
  "models": ["z-ai/*", "*/some-model"]
}
```

### `imageAnalysisTool`

**Type:** `string`  
**Default:** `"mcp_minimax_understand_image"`

The MCP tool the plugin instructs the model to use. The name follows the format `mcp_<server-key>_<tool>`, where `<server-key>` is the key you used when adding the server to the `mcp` object in `opencode.json`.

**Example:**

```json
{
  "imageAnalysisTool": "mcp_openrouter_image_analyze_image"
}
```

### `promptTemplate`

**Type:** `string`  
**Default:** built-in template (see below)

Override the default prompt with a custom template. The template must include **at least one** of the following variables — if none are present, the plugin falls back to the default.

| Variable | Description |
|----------|-------------|
| `{imageList}` | Newline-separated list: `- Image 1: /path/to/file` |
| `{imageCount}` | Number of images, e.g. `1`, `3` |
| `{toolName}` | The configured MCP tool name |
| `{userText}` | The user's original message text (may be empty) |

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
**Default:** OS temp directory + `opencode-minimax-vision/`

Custom directory where pasted images are saved before being passed to the MCP tool.

**Example:**

```json
{
  "tempDir": "/tmp/my-custom-vision-dir"
}
```

### `cleanupAfterHours`

**Type:** `number`  
**Default:** `24`

Temp files older than this many hours are deleted when the plugin initializes.

**Example:**

```json
{
  "cleanupAfterHours": 48
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
  "imageAnalysisTool": "mcp_openrouter_image_analyze_image"
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
