import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // Nest relies on legacy decorators + emitDecoratorMetadata, which esbuild does not emit.
    swc.vite({ module: { type: "es6" } }),
  ],
  test: {
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    environment: "node",
    // Integration and security suites share one PostgreSQL database: run files serially.
    fileParallelism: false,
    globalSetup: ["test/helpers/global-setup.ts"],
    setupFiles: ["test/helpers/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
