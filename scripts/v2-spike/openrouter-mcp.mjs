import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// Live test backend only. The production plugin never invokes a model itself.
const tool = {
  name: "understand_image",
  description:
    "Analyze a saved local image using a vision-capable OpenRouter model.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute path to the saved image" },
      prompt: { type: "string", description: "Question about the image" },
    },
    required: ["path", "prompt"],
    additionalProperties: false,
  },
};
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  try {
    let result;
    switch (request.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "openrouter-vision-test", version: "1.0.0" },
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: [tool] };
        break;
      case "tools/call": {
        if (request.params.name !== tool.name) throw new Error("Unknown tool");
        const { path, prompt } = request.params.arguments;
        if (typeof path !== "string" || typeof prompt !== "string")
          throw new Error("path and prompt are required");
        const key = process.env.OPENROUTER_API_KEY;
        if (!key)
          throw new Error("Set OPENROUTER_API_KEY before starting the test");
        const bytes = await readFile(path);
        if (bytes.length > 10 * 1024 * 1024)
          throw new Error("Test image exceeds 10 MiB");
        let mime;
        if (
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          mime = "image/png";
        else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
          mime = "image/jpeg";
        else if (
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP"
        )
          mime = "image/webp";
        else throw new Error("Expected PNG, JPEG, or WebP");
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            signal: AbortSignal.timeout(90_000),
            headers: {
              authorization: `Bearer ${key}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: process.env.VISION_MODEL ?? "google/gemini-2.5-flash",
              max_tokens: 1024,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mime};base64,${bytes.toString("base64")}`,
                      },
                    },
                  ],
                },
              ],
            }),
          },
        );
        if (!response.ok)
          throw new Error(
            `OpenRouter vision request failed (HTTP ${response.status})`,
          );
        const body = await response.json();
        const text = body.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim())
          throw new Error("OpenRouter returned no analysis");
        result = { content: [{ type: "text", text }] };
        break;
      }
      default:
        throw new Error("Unsupported method");
    }
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n",
    );
  } catch (error) {
    // Do not serialize provider responses, credentials, or file contents on failure.
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message: error.message },
      }) + "\n",
    );
  }
}
