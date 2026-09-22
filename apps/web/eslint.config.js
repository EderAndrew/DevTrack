import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    // Evaluated by Node.js at build/start time.
    files: ["next.config.js"],
    languageOptions: { globals: { process: "readonly" } },
  },
];
