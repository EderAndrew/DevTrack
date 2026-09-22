import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    ignores: ["dist/**"],
  },
  {
    rules: {
      // TypeScript already reports unused/undefined identifiers precisely (type-only usages included).
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    // Principle XXVI: the contract is the API↔web boundary only — no persistence, framework,
    // UI or app code (002 S7, FR-005). test/boundary.spec.ts enforces the same rule.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@prisma/*",
                "@nestjs/*",
                "react",
                "react-dom",
                "next",
                "next/*",
                "@reduxjs/*",
                "express",
                "**/apps/**",
              ],
              message: "@repo/contracts só descreve a fronteira API↔web (Princípio XXVI).",
            },
          ],
        },
      ],
    },
  },
];
