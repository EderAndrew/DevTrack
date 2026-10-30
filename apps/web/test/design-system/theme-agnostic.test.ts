// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EDITOR_THEME } from "@/components/ui/code/editor-theme";
import { SYNTAX_CLASSES } from "@/components/ui/code/highlighter";
import { SCANNED_DIRS, WEB_ROOT, location, readSourceLines, scanSources } from "./scan";

// 022 research Z5, Z10 (FR-012): the theme lives only in the tokens. A screen never asks which theme
// is on, so nothing outside `design-system/tokens.css` may follow the OS preference or pin a scheme.

/** Tailwind `dark:` (in v4 it means `prefers-color-scheme: dark`, which the app ignores). */
const DARK_VARIANT = /(^|[\s"'`{(])dark:[^\s"'`]/;
/** A CodeMirror theme declared dark (`EditorView.theme(spec, { dark: true })`). */
const DARK_EDITOR = /\bdark\s*:\s*true\b/;
const OS_PREFERENCE = /prefers-color-scheme/;
const COLOR_SCHEME = /\bcolorScheme\b|\bcolor-scheme\b/;

const cssFiles = () =>
  SCANNED_DIRS.flatMap((dir) =>
    (readdirSync(join(WEB_ROOT, dir), { recursive: true, encoding: "utf8" }) as string[])
      .filter((entry) => entry.endsWith(".css"))
      .map((entry) => `${dir}/${entry.split("\\").join("/")}`),
  );

const offending = (pattern: RegExp) =>
  [...scanSources(), ...cssFiles().flatMap(readSourceLines)]
    .filter((line) => pattern.test(line.code))
    .map((line) => `${location(line)}: ${line.code.trim()}`);

describe("022/FR-012 022/US3-1 nenhuma tela depende do tema escuro", () => {
  it("nenhum arquivo de app/, components/ ou features/ segue a preferência do sistema", () => {
    expect(offending(OS_PREFERENCE)).toEqual([]);
  });

  it("nenhuma classe usa a variante dark: do Tailwind", () => {
    expect(offending(DARK_VARIANT)).toEqual([]);
  });

  it("color-scheme só em tokens.css", () => {
    expect(offending(COLOR_SCHEME)).toEqual([]);
  });

  it("nenhum tema do CodeMirror é declarado escuro", () => {
    expect(offending(DARK_EDITOR)).toEqual([]);
  });

  it("as expressões pegam o que devem pegar", () => {
    expect(DARK_VARIANT.test('className="dark:bg-input/30"')).toBe(true);
    expect(DARK_VARIANT.test('"px-2 dark:hover:text-accent-foreground"')).toBe(true);
    expect(DARK_VARIANT.test("const dark = 1; data-[x=dark]:p-2")).toBe(false);
    expect(DARK_EDITOR.test("EditorView.theme(spec, { dark: true })")).toBe(true);
    expect(DARK_EDITOR.test("{ dark: false }")).toBe(false);
  });
});

const LITERAL_COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|color-mix)\(/i;

describe("022/US3-3 o realce de código segue os tokens nos dois temas", () => {
  const values = (spec: object): string[] =>
    Object.values(spec).flatMap((value) => (typeof value === "string" ? [value] : values(value as object)));

  it("o tema do editor usa só var(--…) nas cores", () => {
    const colors = Object.values(EDITOR_THEME).flatMap((rule) =>
      Object.entries(rule as Record<string, string>)
        .filter(([property]) => /color|background|border|outline$/i.test(property))
        .map(([property, value]) => `${property}: ${value}`),
    );
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter((declaration) => !declaration.includes("var(--"))).toEqual([]);
    expect(values(EDITOR_THEME).filter((value) => LITERAL_COLOR.test(value))).toEqual([]);
  });

  it("o CodeBlock e o realce usam só as classes dos tokens --syntax-*, e cada uma tem valor no tema claro", () => {
    const tokens = readFileSync(join(WEB_ROOT, "design-system/tokens.css"), "utf8");
    const light = tokens.slice(tokens.search(/:root\[data-theme="light"\]\s*\{/));
    for (const cls of Object.values(SYNTAX_CLASSES)) {
      const name = /^text-(syntax-[a-z]+)$/.exec(cls)?.[1];
      expect(name, cls).toBeDefined();
      expect(light, cls).toMatch(new RegExp(`--${name}:\\s*#`));
    }
    const block = readSourceLines("components/ui/code/code-block.tsx").filter((line) => LITERAL_COLOR.test(line.code));
    expect(block.map(location)).toEqual([]);
  });
});
