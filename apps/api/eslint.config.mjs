import globals from "globals";
import { config as baseConfig } from "@repo/eslint-config/base";

/**
 * 006/FR-001 (research A15): only the AI foundation talks to models, and only its provider
 * adapters (src/modules/ai/gateway/providers) may import a provider SDK. Bare package names go in
 * `paths` (exact match) so that `ai` does not catch our own `modules/ai` folder.
 */
const PROVIDER_MESSAGE = "Provider SDKs only in src/modules/ai/gateway/providers; use the AI foundation (006/FR-001).";
const PROVIDER_PATHS = [
  "openai",
  "@google/genai",
  "@google/generative-ai",
  "ai",
  "langchain",
  "ollama",
  "cohere-ai",
  "groq-sdk",
  "replicate",
].map((name) => ({ name, message: PROVIDER_MESSAGE }));
const PROVIDER_PATTERNS = [
  {
    group: ["openai/*", "@anthropic-ai/*", "@google/genai/*", "@ai-sdk/*", "langchain/*", "@langchain/*", "ollama/*", "@mistralai/*"],
    message: PROVIDER_MESSAGE,
  },
];
/** Domain modules reach AI only through AiExecutionService and AiProposalService. */
const AI_INTERNAL_PATTERNS = [
  {
    group: ["**/ai/gateway", "**/ai/gateway/**", "**/ai/tools/**", "**/ai/output/**", "**/ai/registry/**"],
    message: "Outside src/modules/ai use AiExecutionService / AiProposalService, never the AI internals (006/FR-001).",
  },
];
const PRISMA_IN_CONTROLLERS = [
  {
    group: ["@prisma/client", "@prisma/client/*", "**/generated/prisma", "**/generated/prisma/*"],
    message: "Controllers must not import Prisma; delegate to a service.",
  },
  {
    group: ["**/database/prisma.service", "**/database/transaction"],
    message: "Controllers must not query the database; delegate to a service.",
  },
];

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    ignores: ["dist/**", "coverage/**", "src/generated/**", "test/.tmp/**"],
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
    files: ["src/**/*.ts"],
    ignores: ["src/modules/ai/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: PROVIDER_PATHS, patterns: [...PROVIDER_PATTERNS, ...AI_INTERNAL_PATTERNS] }],
    },
  },
  {
    files: ["src/modules/ai/**/*.ts"],
    ignores: ["src/modules/ai/gateway/providers/**"],
    rules: {
      "no-restricted-imports": ["error", { paths: PROVIDER_PATHS, patterns: PROVIDER_PATTERNS }],
    },
  },
  {
    // Constituição VIII: controllers never talk to the database directly. Flat config replaces the
    // rule's options instead of merging them, so the provider boundary is repeated here.
    files: ["src/**/*.controller.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: PROVIDER_PATHS, patterns: [...PRISMA_IN_CONTROLLERS, ...PROVIDER_PATTERNS, ...AI_INTERNAL_PATTERNS] },
      ],
    },
  },
];
