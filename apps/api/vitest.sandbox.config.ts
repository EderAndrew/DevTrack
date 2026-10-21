import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * The real sandbox (019 research B14): `pnpm --filter api test:sandbox` runs `test/sandbox/*.spec.ts`
 * against `DockerSandbox`, so it needs Docker and the pinned images (`code-runner:images`). Never in
 * the default suite (which uses `FakeSandbox`); CI runs it in a job of its own. Same database setup
 * as the default suite.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/sandbox/**/*.spec.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["test/helpers/global-setup.ts"],
    setupFiles: ["test/helpers/setup-env.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
