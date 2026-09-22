import globals from "globals";
import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    ignores: ["dist/**", "coverage/**", "src/generated/**"],
  },
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
          parserOpts: { plugins: ["decorators-legacy"] },
        },
      },
    },
    rules: {
      // TypeScript already reports unused/undefined identifiers precisely (type-only usages included).
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    // Constituição VIII: controllers never talk to the database directly.
    files: ["src/**/*.controller.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*", "**/generated/prisma", "**/generated/prisma/*"],
              message: "Controllers must not import Prisma; delegate to a service.",
            },
            {
              group: ["**/database/prisma.service", "**/database/transaction"],
              message: "Controllers must not query the database; delegate to a service.",
            },
          ],
        },
      ],
    },
  },
];
