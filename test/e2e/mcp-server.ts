import { appendFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// Minimal stdio MCP server exposing `understand_image`. It checks that the
// path is a readable PNG and records each call to $E2E_CALLS; it does no analysis.
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const tool = {
  name: "understand_image",
  description: "Test double: confirms the image at `path` is a readable PNG.",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
};

interface Request {
  id?: number | string;
  method: string;
  params?: { arguments?: { path?: string } };
}

async function handle({ method, params }: Request): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "easy-vision-e2e", version: "1.0.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [tool] };
    case "tools/call": {
      const path = params?.arguments?.path ?? "";
      const bytes = await readFile(path);
      if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE))
        throw new Error("Not a PNG");
      await appendFile(
        process.env.E2E_CALLS ?? "",
        JSON.stringify({ path }) + "\n",
      );
      return { content: [{ type: "text", text: "PNG is readable" }] };
    }
    default:
      throw new Error(`Unsupported method ${method}`);
  }
}

for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line) as Request;
  if (request.id === undefined) continue;
  const reply = await handle(request).then(
    (result) => ({ result }),
    (error: Error) => ({ error: { code: -32603, message: error.message } }),
  );
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id: request.id, ...reply }) + "\n",
  );
}
