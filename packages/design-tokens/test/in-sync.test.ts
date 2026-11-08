import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedSource, parseTokens } from "../scripts/parse-tokens.ts";
import { colors, colorsFor, spacing, typography } from "../src/index.ts";

// 024 research Y11: src/generated.ts is tokens.css, regenerated; any edit of tokens.css without
// `pnpm --filter @repo/design-tokens generate` (or a hand edit of the generated file) fails here.
const TOKENS_CSS = readFileSync(new URL("../../../apps/web/design-system/tokens.css", import.meta.url), "utf8");
const GENERATED = readFileSync(new URL("../src/generated.ts", import.meta.url), "utf8");

describe("024/FR-023 os tokens do app são os do Design System do web", () => {
  it("src/generated.ts é exatamente o que tokens.css gera hoje", () => {
    expect(GENERATED).toBe(generatedSource(TOKENS_CSS));
  });

  it("os dois temas têm as mesmas cores, todas em formato que o React Native lê", () => {
    expect(Object.keys(colors.light)).toEqual(Object.keys(colors.dark));
    for (const value of [...Object.values(colors.dark), ...Object.values(colors.light)]) {
      expect(value).toMatch(/^(#[0-9a-f]{6}|rgba?\(\d+, \d+, \d+(, [\d.]+)?\))$/);
    }
    expect(colorsFor("dark").background).toBe("#0b0f2b");
    expect(colorsFor("light").background).toBe("#f1faee");
    // Aliases resolve per theme, as in the browser.
    expect(colorsFor("light").card).toBe(colorsFor("light").surface);
  });

  it("a escala tipográfica vem em px (rem × 16), com altura de linha e peso", () => {
    expect(typography.body).toEqual({ fontSize: 16, lineHeight: 24, fontWeight: "400" });
    expect(typography.wordmark.fontSize).toBe(44);
  });

  it("o espaçamento segue os passos permitidos do web, em múltiplos de 4", () => {
    for (const [step, value] of Object.entries(spacing)) expect(value).toBe(Number(step) * 4);
  });

  it("um valor que o app não sabe ler interrompe a geração", () => {
    const broken = TOKENS_CSS.replace("--background: #0b0f2b;", "--background: hsl(230 59% 11%);");
    expect(() => parseTokens(broken)).toThrow(/formato não suportado/);
    const unknownFont = TOKENS_CSS.replace("var(--font-inter), system-ui", "var(--font-roboto), system-ui");
    expect(() => parseTokens(unknownFont)).toThrow(/família sem fonte do app/);
  });
});
