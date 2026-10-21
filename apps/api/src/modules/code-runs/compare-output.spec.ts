import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeOutput, outputsMatch } from "./compare-output";

describe("019/FR-012 comparação da saída (research B7)", () => {
  it("019/FR-012 quebras de linha \\r\\n e \\r valem como \\n", () => {
    expect(outputsMatch("1\r\n2\r\n", "1\n2\n")).toBe(true);
    expect(outputsMatch("1\r2", "1\n2")).toBe(true);
    expect(normalizeOutput("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("019/FR-012 espaços e tabulações no fim da linha não contam", () => {
    expect(outputsMatch("soma 3   \nfim\t\t\n", "soma 3\nfim")).toBe(true);
    expect(outputsMatch("x \t \r\n", "x")).toBe(true);
  });

  it("019/FR-012 linhas vazias no fim não contam (o print acrescenta uma)", () => {
    expect(outputsMatch("42\n", "42")).toBe(true);
    expect(outputsMatch("42\n\n\n", "42\n")).toBe(true);
    expect(outputsMatch("42\n  \n\t\n", "42")).toBe(true);
  });

  it("019/FR-012 maiúsculas, acentos, espaço interno, espaço no começo e linha em branco no meio contam", () => {
    expect(outputsMatch("Sim", "sim")).toBe(false);
    expect(outputsMatch("ação", "acao")).toBe(false);
    expect(outputsMatch("a  b", "a b")).toBe(false);
    expect(outputsMatch(" a", "a")).toBe(false);
    expect(outputsMatch("a\n\nb", "a\nb")).toBe(false);
    expect(outputsMatch("1 2", "1\n2")).toBe(false);
    // Unicode forms are not normalized: "é" composed and decomposed differ.
    expect(outputsMatch("é", "é")).toBe(false);
  });

  it("019/FR-012 saída vazia: só igual a esperada vazia (ou só com linhas em branco)", () => {
    expect(outputsMatch("", "")).toBe(true);
    expect(outputsMatch("\n \n", "")).toBe(true);
    expect(outputsMatch("", "0")).toBe(false);
    expect(outputsMatch("0", "")).toBe(false);
  });

  it("019/FR-012 o módulo é puro: sem imports (a correção futura o reusa)", () => {
    const source = readFileSync(join(__dirname, "compare-output.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
