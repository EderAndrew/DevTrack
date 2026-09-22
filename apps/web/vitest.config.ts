import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps `jsx: "preserve"` for Next.js; tests need JSX compiled (React automatic runtime).
  oxc: { jsx: { runtime: "automatic" } },
  // Same `@/*` alias as tsconfig.json (002 S12).
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["test/setup.ts"],
  },
});
