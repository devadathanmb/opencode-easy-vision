import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Each file runs in its own process, so HOME/env stubs cannot leak between files.
    pool: "forks",
    unstubEnvs: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // types.ts has no runtime code.
      exclude: ["src/types.ts"],
      reporter: ["text", "html"],
      // Floors, not targets: CI fails if coverage regresses below these.
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
    },
  },
});
