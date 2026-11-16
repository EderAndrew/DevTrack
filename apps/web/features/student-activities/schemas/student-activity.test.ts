import { describe, expect, it } from "vitest";
import { formatHundredths, gradePercent, gradeSummary, wholePercent } from "./student-activity";

describe("012/FR-012 percentual da nota em centésimos inteiros", () => {
  it("0,60 de 0,75 → 80%; 0,25 de 0,25 → 100%; 0,40 de 0,75 → 53% (arredondado)", () => {
    expect(gradePercent("0.60", "0.75")).toBe(80);
    expect(gradePercent("0.25", "0.25")).toBe(100);
    expect(gradePercent("0.40", "0.75")).toBe(53);
    expect(gradePercent("10.00", "10.00")).toBe(100);
    expect(gradePercent("0.00", "1.00")).toBe(0);
  });

  it("sem total, total zero ou formato fora do contrato: nenhum percentual", () => {
    expect(gradePercent("0.60", null)).toBeNull();
    expect(gradePercent("0.00", "0.00")).toBeNull();
    expect(gradePercent("0.6", "0.75")).toBeNull();
    expect(gradePercent("abc", "0.75")).toBeNull();
  });

  it("013 pontos: inteiros, limitados a 0–100%", () => {
    expect(wholePercent(45, 105)).toBe(43);
    expect(wholePercent(0, 105)).toBe(0);
    expect(wholePercent(120, 105)).toBe(100);
    expect(wholePercent(1, 0)).toBeNull();
  });
});

describe("012/FR-012 resumo das atividades exibidas", () => {
  const graded = (grade: string, totalGrade: string) => ({ result: { grade, hasFeedback: false }, totalGrade });

  it("soma só as notas liberadas, em centésimos: 0,60 de 0,75 + 0,25 de 0,25 = 0,85 de 1,00, 85%", () => {
    const summary = gradeSummary([
      graded("0.60", "0.75"),
      graded("0.25", "0.25"),
      { result: null, totalGrade: "1.00" }, // entregue, ainda sem liberação: não conta
      { result: null, totalGrade: null }, // 013: um Exercício nunca entra como nota
    ]);
    expect(summary).toEqual({ graded: 2, earned: 85, possible: 100, percent: 85 });
  });

  it("sem nota liberada: zero corrigidas e nenhum percentual", () => {
    expect(gradeSummary([{ result: null, totalGrade: "1.00" }])).toEqual({ graded: 0, earned: 0, possible: 0, percent: null });
    expect(gradeSummary([])).toEqual({ graded: 0, earned: 0, possible: 0, percent: null });
  });

  it("formato fora do contrato fica de fora; centésimos voltam com vírgula", () => {
    expect(gradeSummary([graded("0.6", "0.75"), graded("0.50", "1.00")])).toEqual({ graded: 1, earned: 50, possible: 100, percent: 50 });
    expect(formatHundredths(85)).toBe("0,85");
    expect(formatHundredths(5)).toBe("0,05");
    expect(formatHundredths(1250)).toBe("12,50");
    expect(formatHundredths(0)).toBe("0,00");
  });
});
