import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/** Seed of the exam load test (`test/load/exam.seed.ts`): never in the default suite. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/load/*.seed.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["test/helpers/global-setup.ts"],
    setupFiles: ["test/helpers/setup-env.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
