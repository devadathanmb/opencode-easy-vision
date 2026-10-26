import { appendFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const tool = {
  name: "understand_image",
  description:
    "Synthetic fixture: verify a saved PNG is readable. Does not analyze images.",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
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
          serverInfo: { name: "vision-spike-fixture", version: "1.0.0" },
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: [tool] };
        break;
      case "tools/call": {
        if (request.params.name !== tool.name)
          throw new Error("Unknown fixture tool");
        const path = request.params.arguments.path;
        const bytes = await readFile(path);
        if (
          !bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
          throw new Error("Not a PNG");
        }
        await appendFile(
          process.env.SPIKE_CALLS,
          JSON.stringify({ path, bytes: bytes.length }) + "\n",
        );
        result = { content: [{ type: "text", text: "SPIKE_PNG_READABLE" }] };
        break;
      }
      default:
        throw new Error("Unsupported fixture method");
    }
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n",
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message: error.message },
      }) + "\n",
    );
  }
}
