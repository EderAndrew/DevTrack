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
    // 024 (research Y11): the tokens are plain values for React Native, generated from the web's
    // tokens.css; no framework or app code.
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-native", "next", "next/*", "@nestjs/*", "@prisma/*", "**/apps/**"],
              message: "@repo/design-tokens só guarda valores gerados de tokens.css (research Y11).",
            },
          ],
        },
      ],
    },
  },
];
