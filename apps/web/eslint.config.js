import { nextJsConfig } from "@repo/eslint-config/next-js";

// Layer rules of specs/002-stack-alignment/contracts/web-architecture.md (FR-025). A later
// config object replaces the whole option list of a rule, so each scope repeats the lists it keeps.

const STACK = [
  { group: ["@reduxjs/*"], message: "Redux está fora do escopo (FR-028); estado do servidor fica no TanStack Query." },
  { group: ["axios", "axios/*"], message: "Use o wrapper de fetch em lib/api (Constituição, stack oficial)." },
  {
    group: [
      "react-icons",
      "react-icons/*",
      "@heroicons/*",
      "@radix-ui/react-icons",
      "@fortawesome/*",
      "@tabler/icons-react",
      "@tabler/icons-react/*",
      "@phosphor-icons/react",
      "@phosphor-icons/react/*",
    ],
    message: "Use Lucide (lucide-react), a biblioteca oficial de ícones (005/FR-012).",
  },
  {
    group: [
      "@mui/*",
      "@chakra-ui/*",
      "@mantine/*",
      "antd",
      "antd/*",
      "@headlessui/*",
      "react-bootstrap",
      "react-bootstrap/*",
      "@nextui-org/*",
      "@heroui/*",
    ],
    message: "UI usa shadcn/ui sobre radix-ui (005/FR-035).",
  },
];
const API_LAYER = {
  group: ["@/lib/api", "@/lib/api/*", "**/lib/api", "**/lib/api/*"],
  message: "Só features/*/api e lib/ chamam a API; use as funções da feature (FR-025).",
};
const SERVER_READS = {
  group: ["@/features/*/api/server", "**/api/server"],
  message: "Leituras de servidor (next/headers) só em Server Components de app/; aqui o código roda no cliente.",
};
const CONTRACTS_AS_VALUE = {
  name: "@repo/contracts",
  allowTypeImports: true,
  message: "Componentes compartilhados não conhecem contratos de domínio; só `import type`.",
};

// Design-system layers (005/FR-034): tokens → ui → layout → features → app, each importing only
// the layers below it.
const LAYERS_MESSAGE = "Camadas do Design System: tokens → ui → layout → features → app (005/FR-034).";
const UI_LAYER = {
  group: [
    "@/components/layout",
    "@/components/layout/*",
    "@/components/shared",
    "@/components/shared/*",
    "../layout",
    "../layout/*",
    "../shared",
    "../shared/*",
    "@/features/*",
    "**/features/*",
    "@/app",
    "@/app/*",
    "**/app/*",
  ],
  message: LAYERS_MESSAGE,
};
const LAYOUT_LAYER = {
  group: ["@/features/*/components", "**/features/*/components", "@/app", "@/app/*", "**/app/*"],
  message: LAYERS_MESSAGE,
};

const restrictImports = (...patterns) => ({
  "no-restricted-imports": ["error", { paths: [], patterns: [...STACK, ...patterns] }],
});

const FETCH_MESSAGE = "Só lib/api/client.ts usa fetch e XMLHttpRequest; chame as funções de features/*/api (FR-025).";
const TESTS = ["**/*.test.{ts,tsx}", "test/**", "e2e/**"];

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    // TypeScript sources are linted too (the layer rules below are for them). Babel 8 no longer
    // enables JSX for .tsx by itself, and type names are not variables: tsc checks undefined and
    // unused identifiers (`pnpm check-types`), so the core rules that cannot see types are off.
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
          overrides: [{ test: /\.tsx$/, parserOpts: { plugins: ["jsx"] } }],
        },
      },
    },
    rules: { "no-undef": "off", "no-unused-vars": "off", "no-redeclare": "off", "no-dupe-args": "off" },
  },
  {
    // Evaluated by Node.js at build/start time.
    files: ["next.config.js"],
    languageOptions: { globals: { process: "readonly" } },
  },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    rules: {
      ...restrictImports(API_LAYER),
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: FETCH_MESSAGE },
        { name: "XMLHttpRequest", message: FETCH_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: FETCH_MESSAGE },
        { object: "globalThis", property: "fetch", message: FETCH_MESSAGE },
        { object: "window", property: "XMLHttpRequest", message: FETCH_MESSAGE },
        { object: "globalThis", property: "XMLHttpRequest", message: FETCH_MESSAGE },
      ],
    },
  },
  {
    files: ["features/*/api/**", "lib/**"],
    rules: restrictImports(),
  },
  {
    files: ["features/*/components/**", "features/*/hooks/**", "components/**"],
    rules: restrictImports(API_LAYER, SERVER_READS),
  },
  {
    files: ["components/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [CONTRACTS_AS_VALUE], patterns: [...STACK, API_LAYER, SERVER_READS] },
      ],
    },
  },
  {
    files: ["components/ui/**"],
    rules: restrictImports(API_LAYER, SERVER_READS, UI_LAYER),
  },
  {
    files: ["components/layout/**"],
    rules: restrictImports(API_LAYER, SERVER_READS, LAYOUT_LAYER),
  },
  {
    files: ["lib/api/**", ...TESTS],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
  {
    // Tests stub fetch and may build ApiError; the stack rules still apply.
    files: TESTS,
    rules: restrictImports(),
  },
  {
    // `pnpm --filter web test:e2e` is not a Turborepo task; global-setup.ts hands the bootstrap
    // ADMIN to the workers through the environment.
    files: ["e2e/**"],
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
];
