// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// axe in jsdom cannot measure contrast (no layout), so the theme tokens are checked here
// directly: WCAG 2.2 AA, 4.5:1 for text and 3:1 for graphics, control borders and the focus
// ring (002 S12, 005 contracts/tokens.md).

const TOKENS_URL = new URL("../design-system/tokens.css", import.meta.url);
const css = existsSync(TOKENS_URL) ? readFileSync(TOKENS_URL, "utf8").replace(/\/\*[\s\S]*?\*\//g, "") : "";

type Tokens = Record<string, string>;

/** Custom properties declared in the first block opened by `selector` in `source`. */
function blockTokens(source: string, selector: RegExp): Tokens {
  const start = source.search(selector);
  if (start < 0) return {};
  const open = source.indexOf("{", start);
  const body = source.slice(open + 1, source.indexOf("}", open));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

// One dark theme since the Vice City palette (005 FR-013, amended 2026-10-22).
const THEMES: Record<string, Tokens> = {
  escuro: blockTokens(css, /:root\s*\{/),
};

/** Follows `var(--x)` aliases down to a literal value. */
function resolve(tokens: Tokens, name: string): string | undefined {
  let value = tokens[name];
  for (let depth = 0; value !== undefined && depth < 10; depth++) {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (!alias) return value;
    value = tokens[alias[1]!];
  }
  return value;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`cor não é #rrggbb: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

type Pair = [foreground: string, background: string, minimum: number];

const SURFACES = ["--background", "--surface"];
const STATES = ["success", "warning", "danger", "info"];
const TEXTS = ["--foreground", "--text-secondary", "--primary", ...STATES.map((s) => `--${s}-text`)];
const GRAPHICS = [...STATES.map((s) => `--${s}`), "--border-control", "--ring"];

const PAIRS: Pair[] = [
  ...TEXTS.flatMap((text) => SURFACES.map((surface): Pair => [text, surface, 4.5])),
  ...STATES.map((s): Pair => [`--${s}-text`, `--${s}-surface`, 4.5]),
  ["--primary-foreground", "--primary", 4.5],
  ["--primary-foreground", "--primary-hover", 4.5],
  ["--danger-foreground", "--danger", 4.5],
  ["--primary-strong", "--primary-subtle", 4.5],
  // shadcn aliases the screens still use until the Phase 4 migration.
  ["--muted-foreground", "--card", 4.5],
  ["--sidebar-accent-foreground", "--sidebar-accent", 4.5],
  ...GRAPHICS.flatMap((graphic) => SURFACES.map((surface): Pair => [graphic, surface, 3])),
];

describe.each(Object.entries(THEMES))(
  "005/SC-002 005/US1-2 002/US3-3 002/US3-4 contraste AA dos tokens do tema %s",
  (_theme, tokens) => {
    it.each(PAIRS)("%s sobre %s ≥ %s:1", (foreground, background, minimum) => {
      const fg = resolve(tokens, foreground);
      const bg = resolve(tokens, background);
      expect(fg, foreground).toBeDefined();
      expect(bg, background).toBeDefined();
      expect(ratio(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
    });
  },
);

// 014 (contracts/design-tokens.md): each syntax color, and the plain code text, over every
// background code sits on — the page, a surface, the editor's selection (`--primary-subtle`, the
// text keeps its syntax color) and a disabled editor (`--disabled-bg`).
const SYNTAX = ["keyword", "string", "number", "comment", "type", "function", "operator", "punctuation"].map((n) => `--syntax-${n}`);
const CODE_BACKGROUNDS = ["--background", "--surface", "--primary-subtle", "--disabled-bg"];
const SYNTAX_PAIRS: Pair[] = [...SYNTAX, "--foreground"].flatMap((text) =>
  CODE_BACKGROUNDS.map((background): Pair => [text, background, 4.5]),
);

describe.each(Object.entries(THEMES))("014/FR-017 014/SC-005 contraste AA das cores de sintaxe do tema %s", (_theme, tokens) => {
  it.each(SYNTAX_PAIRS)("%s sobre %s ≥ %s:1", (foreground, background, minimum) => {
    const fg = resolve(tokens, foreground);
    const bg = resolve(tokens, background);
    expect(fg, foreground).toBeDefined();
    expect(bg, background).toBeDefined();
    expect(ratio(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
  });
});

describe("005/SC-002 tema único escuro (Vice City)", () => {
  it("tokens.css tem um só tema, escuro, sem variação pela preferência do sistema nem data-theme", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).not.toMatch(/data-theme/);
    expect(css).toMatch(/color-scheme:\s*dark;/);
    expect(THEMES.escuro!["--background"]).toBe("#0b0f2b");
    expect(THEMES.escuro!["--primary"]).toBe("#ff5ca8");
  });
});
