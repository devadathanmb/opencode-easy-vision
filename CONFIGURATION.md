# Configuration

This plugin reads its configuration from dedicated `.json` or `.jsonc` files. See [Config File Locations](#config-file-locations) for where to place them.

These options apply to OpenCode v2 (plugin 2.x). Inline `options` in OpenCode's `plugins` array are not read; use the files below. Each project location gets its own config, even when one OpenCode service serves several projects.

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
| 1 | Project | `.opencode/opencode-easy-vision.json` or `.jsonc` |
| 2 | User | `~/.config/opencode/opencode-easy-vision.json` or `.jsonc` |

The plugin merges options across levels. For example, a project `models` setting overrides the user setting while the user-level `imageAnalysisTool` remains in effect when the project config does not set it.

At each level, a valid JSONC file takes precedence over JSON. The pre-2.0 `opencode-minimax-easy-vision.json(c)` filenames are no longer read; rename them to `opencode-easy-vision.json(c)`.

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

Matching is case-insensitive and uses the active request's provider/model, not an earlier user turn's selection. Nested IDs such as `openrouter/deepseek/deepseek-v4-flash-0731` work; variants do not participate. Default provider patterns are unchanged.

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

OpenCode v2 names MCP tools `<server>_<tool>`, with characters other than letters, digits, `_` and `-` in the server name replaced by `_`. The example server `MiniMax` and tool `understand_image` yield this default. The name is matched exactly: it is not lowercased or given an `mcp_` prefix. Config files that still use the 1.x default `mcp_minimax_understand_image` need updating.

The plugin also uses this name to find the MCP server whose Code Mode it disables (see [`disableCodeMode`](#disablecodemode)). If the tool is not available in a request (disconnected, misnamed, or denied by permissions), the model receives a note saying so; the plugin never calls the tool itself or bypasses permissions. A server can report connected shortly before its tools are registered, so retry after startup if needed.

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

If the tool is still exposed through Code Mode, routing guidance for `execute` is appended to your template. All original text parts remain in order. Only the latest user message receives analysis instructions; images in older turns are replaced with their saved paths only. `compaction`, `title`, and transient `generate` requests receive paths and failure notes only, without tool-call instructions.

| Variable       | Description                                        |
| -------------- | -------------------------------------------------- |
| `{imageList}`  | Newline-separated list: `- Image 1: /path/to/file` |
| `{imageCount}` | Number of images, e.g. `1`, `3`                    |
| `{toolName}`   | The configured MCP tool name                       |
| `{userText}`   | The text the user typed (may be empty); excludes skill bodies and attached-file contents |

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

Paths are on the **OpenCode server host**. Remote MCPs/containers need an explicit shared filesystem; remote clients do not share these paths automatically. HTTP(S) sources may pass through, but V2 often materializes attachments into base64 first. Provider refs, private-header URLs, malformed data, and unsupported image formats get explicit failures. Targeted raw image content is removed for matching requests even if saving fails; non-image media and unmatched-model requests are unchanged.

Filenames are SHA-256 hashes of normalized MIME and decoded bytes. Repeated requests recreate missing files; files are written atomically with owner-only permissions. Use a private temp directory for sensitive images.

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

Cleanup only deletes files named like plugin-generated SHA-256 hashes, and coordinates with active writes in the same server process. Files from 1.x in the old `opencode-minimax-vision` temp directory are no longer cleaned up; your OS clears its temp directory on its own. Do not place your own files with 64-character hex names in a cleanup directory.

**Example:**

```json
{
  "cleanupAfterHours": 48
}
```

### `disableCodeMode`

**Type:** `boolean`  
**Default:** `true`

OpenCode v2 exposes MCP tools through Code Mode by default: the model cannot call them directly and has to write code for an `execute` tool instead. When this option is `true`, the plugin sets `codemode: false` on the MCP server that provides [`imageAnalysisTool`](#imageanalysistool), so the model can call the tool directly as the prompt instructs. Only that server is changed, and only when its `codemode` is not set explicitly in your OpenCode config; an explicit setting always wins. If the tool name could belong to more than one server (for example servers `foo` and `foo_bar` with tool `foo_bar_tool`), the plugin changes nothing and logs which servers matched; set `codemode: false` on the right server yourself.

Set it to `false` to leave Code Mode alone. The plugin then appends guidance telling the model to reach the tool through `execute`.

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
