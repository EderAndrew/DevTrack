import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * On-demand evaluation (007 research C17, FR-051; 010 research X16; 011 research W17): `pnpm --filter api
 * eval:curriculum`, `pnpm --filter api eval:exercises` and `pnpm --filter api eval:works` (and later `eval:help`,
 * `eval:exams`), one file each. Only
 * `test/eval/**\/*.eval.ts`, never in the default suite nor in CI: it calls the real provider and
 * needs `OPENROUTER_API_KEY` (008 research G20). Same database setup as the default suite (the test database).
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/eval/**/*.eval.ts"],
    environment: "node",
    fileParallelism: false,
    globalSetup: ["test/helpers/global-setup.ts"],
    setupFiles: ["test/helpers/setup-env.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
