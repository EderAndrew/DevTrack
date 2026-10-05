import type { LanguageSupport } from "@codemirror/language"

/**
 * The grammars the code colors can parse (014 research L3): grammar key → lazy loader of the
 * CodeMirror `LanguageSupport`. These are the library's parsing capabilities, not the catalog's
 * languages: which grammar a catalog language uses is data (`programming_languages.highlight`),
 * so no catalog language is a condition here. Each grammar is its own chunk, downloaded only
 * when code of that grammar appears (L6).
 */
const LOADERS = {
  java: () => import("@codemirror/lang-java").then((m) => m.java()),
  python: () => import("@codemirror/lang-python").then((m) => m.python()),
  javascript: () => import("@codemirror/lang-javascript").then((m) => m.javascript()),
  typescript: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true })),
  cpp: () => import("@codemirror/lang-cpp").then((m) => m.cpp()),
  php: () => import("@codemirror/lang-php").then((m) => m.php()),
  rust: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  go: () => import("@codemirror/lang-go").then((m) => m.go()),
  html: () => import("@codemirror/lang-html").then((m) => m.html()),
} satisfies Record<string, () => Promise<LanguageSupport>>

export type GrammarKey = keyof typeof LOADERS
export type GrammarLoader = () => Promise<LanguageSupport>

export const GRAMMAR_KEYS = Object.keys(LOADERS) as GrammarKey[]

/** The loader of `key`, or null for no grammar (null, unknown key): the code shows as plain text. */
export function grammarLoader(key: string | null | undefined): GrammarLoader | null {
  if (!key || !Object.hasOwn(LOADERS, key)) return null
  return LOADERS[key as GrammarKey]
}
