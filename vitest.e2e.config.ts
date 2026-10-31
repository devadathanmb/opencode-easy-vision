import { defineConfig } from "vitest/config";

// End-to-end tests against the installed `opencode` binary; run with `just e2e`.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
