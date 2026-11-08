import { config as reactConfig } from "@repo/eslint-config/react-internal";
import { createRequire } from "node:module";
import globals from "globals";

// The shared config's TypeScript preset, resolved from @repo/eslint-config (pnpm keeps it there).
const presetTypescript = createRequire(import.meta.resolve("@repo/eslint-config/base")).resolve("@babel/preset-typescript");

// 024 (constitution 3.7.0, "Stack oficial do mobile"; contracts/mobile-ui.md): one solution per
// responsibility and the web's layers — components only render, hooks call features/*/api, and only
// that layer touches lib/api. A later config object replaces the whole option list of a rule, so each
// scope repeats the lists it keeps.

const STACK = [
  { group: ["axios", "axios/*"], message: "Use o fetch de lib/api (stack oficial do mobile)." },
  {
    group: ["@react-native-async-storage/*", "react-native-mmkv"],
    message: "A sessão fica só no expo-secure-store (constituição 3.7.0); nada de armazenamento comum.",
  },
  {
    group: ["nativewind", "nativewind/*", "styled-components", "styled-components/*", "@emotion/*", "tamagui", "@tamagui/*"],
    message: "Estilo só com StyleSheet e @repo/design-tokens (research Y11).",
  },
  {
    group: ["react-native-vector-icons", "react-native-vector-icons/*", "@expo/vector-icons", "@expo/vector-icons/*"],
    message: "Use Lucide (lucide-react-native), a biblioteca oficial de ícones.",
  },
  {
    group: ["expo-server-sdk", "firebase", "firebase/*", "@react-native-firebase/*"],
    message: "Push só por expo-notifications (research Y6).",
  },
];
const API_LAYER = {
  group: ["@/lib/api", "@/lib/api/*", "**/lib/api", "**/lib/api/*"],
  message: "Só features/*/api chama a API; use os hooks da feature (contracts/mobile-ui.md).",
};
const FEATURE_API = {
  group: ["@/features/*/api", "@/features/*/api/*", "**/features/*/api", "**/features/*/api/*"],
  message: "Componentes e telas usam os hooks da feature, nunca a camada api diretamente.",
};

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    ignores: ["node_modules/**", ".expo/**", "android/**", "ios/**", "babel.config.js", "jest.config.js", "expo-env.d.ts"],
  },
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      // The app's babel.config.js (babel-preset-expo, Babel 7) is for Metro and Jest only; ESLint's
      // parser runs on Babel 8 with the shared TypeScript preset, so it must not load that file.
      parserOptions: { babelOptions: { babelrc: false, configFile: false, presets: [presetTypescript], parserOpts: { plugins: ["jsx"] } } },
    },
    rules: {
      // TypeScript already reports unused/undefined identifiers precisely (type-only usages included).
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-restricted-imports": ["error", { patterns: STACK }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "features/*/components/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [...STACK, API_LAYER, FEATURE_API] }] },
  },
  {
    files: ["features/*/hooks/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [...STACK, API_LAYER] }] },
  },
];
