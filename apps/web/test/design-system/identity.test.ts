// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT, classTokens, location, scanSources } from "./scan";

// 005 US1 (FR-005, FR-011, FR-021): the official identity at the base of every screen — focus
// ring, monospace only for code, system fallbacks for the fonts and reduced motion.

const read = (file: string) => readFileSync(join(WEB_ROOT, file), "utf8");
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const tokens = withoutComments(read("design-system/tokens.css"));
const globals = withoutComments(read("app/globals.css"));
const layout = read("app/layout.tsx");

interface CssRule {
  selector: string;
  body: string;
}

/** Innermost `selector { declarations }` rules of a stylesheet (at-rule wrappers skipped). */
function rules(css: string): CssRule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim().replace(/\s+/g, " "),
    body: match[2]!,
  }));
}

/** The text inside the block opened by the first occurrence of `opener` (balanced braces). */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}" && (depth -= 1) === 0) return css.slice(open + 1, index);
  }
  return css.slice(open + 1);
}

/** Last value declared for `name` in `css`. */
function declared(css: string, name: string): string | undefined {
  return [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, "g"))].at(-1)?.[1]!.trim();
}

// Elements that only receive focus from a script (`tabIndex={-1}` on the route change), never
// from the keyboard, may drop the outline.
const SCRIPT_FOCUS_ONLY = new Set(["main:focus"]);

describe("005/US1-3 contorno de foco oficial", () => {
  it(":focus-visible usa --focus-ring-width, --focus-ring-offset e --ring", () => {
    const focus = rules(globals).find((rule) => rule.selector === ":focus-visible");
    expect(focus, ":focus-visible em app/globals.css").toBeDefined();
    expect(declared(focus!.body, "outline")).toBe("var(--focus-ring-width) solid var(--ring)");
    expect(declared(focus!.body, "outline-offset")).toBe("var(--focus-ring-offset)");
    expect(declared(tokens, "--focus-ring-width")).toBe("3px");
    expect(declared(tokens, "--focus-ring-offset")).toBe("2px");
  });

  it("nenhuma regra remove o outline sem alternativa", () => {
    const removals = [...rules(tokens), ...rules(globals)].filter(
      (rule) =>
        /(^|;)\s*outline\s*:\s*(none|0)\b/.test(rule.body) &&
        !/box-shadow|border/.test(rule.body) &&
        !SCRIPT_FOCUS_ONLY.has(rule.selector),
    );
    expect(removals.map((rule) => rule.selector)).toEqual([]);
  });
});

describe("005/US1-4 fonte monoespaçada só para código", () => {
  it("no @layer base, font-mono só em code, kbd, samp e pre", () => {
    const mono = rules(block(globals, "@layer base")).filter((rule) => /font-mono|--font-mono/.test(rule.body));
    expect(mono.map((rule) => rule.selector)).toEqual(["code, kbd, samp, pre"]);
  });

  it("a classe font-mono só aparece em components/ui", () => {
    const outside = scanSources()
      .filter((line) => !line.file.startsWith("components/ui/"))
      .filter((line) => classTokens(line.code).some((token) => /(^|:)font-mono$/.test(token)))
      .map(location);
    expect(outside).toEqual([]);
  });
});

describe("005/US1-5 fontes substitutas equivalentes", () => {
  it("--font-sans e --font-mono terminam em fontes de sistema", () => {
    const sans = declared(tokens, "--font-sans");
    const mono = declared(tokens, "--font-mono");
    expect(sans).toMatch(/^var\(--font-inter\),.*system-ui.*,\s*sans-serif$/);
    expect(mono).toMatch(/^var\(--font-jetbrains-mono\),.*ui-monospace.*,\s*monospace$/);
  });

  it('layout.tsx carrega as três fontes com display: "swap" e a Inter com métrica ajustada', () => {
    expect(layout.match(/display:\s*"swap"/g)).toHaveLength(3);
    expect(layout).toMatch(/adjustFontFallback:\s*"Arial"/);
    expect(layout).toContain('variable: "--font-inter"');
    expect(layout).toContain('variable: "--font-jetbrains-mono"');
    expect(layout).toContain('variable: "--font-fredoka"');
  });

  it("--font-brand (Fredoka) termina em fontes de sistema e só aparece na marca e na nota do card do aluno", () => {
    expect(declared(tokens, "--font-brand")).toMatch(/^var\(--font-fredoka\),.*system-ui.*,\s*sans-serif$/);
    const files = scanSources()
      .filter((line) => classTokens(line.code).some((token) => /(^|:)font-brand$/.test(token)))
      .map((line) => line.file);
    expect(new Set(files)).toEqual(
      new Set(["components/shared/wordmark.tsx", "features/student-activities/components/activity-card.tsx"]),
    );
  });
});

describe("005/US1-6 005/SC-010 menos movimento", () => {
  const reduced = block(globals, "@media (prefers-reduced-motion: reduce)");

  it("zera cada --duration-* dos tokens", () => {
    const durations = [...tokens.matchAll(/(--duration-[\w-]+)\s*:/g)].map((match) => match[1]!);
    expect(durations.length).toBeGreaterThan(0);
    for (const name of new Set(durations)) {
      expect(declared(reduced, name), name).toBe("0.01ms");
    }
  });

  it("remove transition e animation", () => {
    expect(reduced).toMatch(/transition:\s*none\s*!important/);
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
  });
});
