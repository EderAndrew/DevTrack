import { describe, expect, it } from "vitest";
import { centsToGrade, distributeGrade, GradeOutputSchema, GradeStringSchema, gradeToCents } from "../src/index.js";

const parse = (grade: string) => (GradeStringSchema.safeParse(grade).success ? gradeToCents(grade) : null);

function expectFairSplit(total: number, count: number) {
  const values = distributeGrade(total, count);
  expect(values).toHaveLength(count);
  expect(values.reduce((sum, value) => sum + value, 0)).toBe(total);
  expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  values.slice(1).forEach((value, index) => expect(value).toBeLessThanOrEqual(values[index]!));
}

describe("011 nota do trabalho em centésimos exatos (research W3, W4)", () => {
  it("011/US2-1 0,50 em 10 questões → 0,05 cada", () => {
    expect(distributeGrade(parse("0.50")!, 10)).toEqual(Array(10).fill(5));
  });

  it("011/US2-2 1,00 em 10 questões → 0,10 cada; 0,50 em 5 → 0,10 cada", () => {
    expect(distributeGrade(parse("1.00")!, 10)).toEqual(Array(10).fill(10));
    expect(distributeGrade(parse("0.50")!, 5)).toEqual(Array(5).fill(10));
  });

  it("011/US2-3 0,50 em 3 questões → 0,17, 0,17, 0,16 na ordem de posição", () => {
    expect(distributeGrade(50, 3)).toEqual([17, 17, 16]);
    expect(distributeGrade(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
    expect(distributeGrade(50, 3).map(centsToGrade)).toEqual(["0.17", "0.17", "0.16"]);
  });

  it("011/US2-5 aceita até duas casas com ponto e recusa o resto, sem arredondar", () => {
    expect(parse("0.5")).toBe(50);
    expect(parse("1")).toBe(100);
    expect(parse("0.50")).toBe(50);
    expect(parse("100.00")).toBe(10_000);
    expect(parse("0.01")).toBe(1);
    for (const invalid of ["0.505", "-1.00", "0.00", "100.01", "0,50", "", "1.", ".5", "1000"]) {
      expect(GradeStringSchema.safeParse(invalid).success, invalid).toBe(false);
    }
  });

  it("011/US2-6 a saída tem sempre duas casas", () => {
    expect(centsToGrade(50)).toBe("0.50");
    expect(centsToGrade(5)).toBe("0.05");
    expect(centsToGrade(100)).toBe("1.00");
    expect(centsToGrade(10_000)).toBe("100.00");
    expect(GradeOutputSchema.safeParse("0.50").success).toBe(true);
    expect(GradeOutputSchema.safeParse("0.5").success).toBe(false);
    for (let cents = 1; cents <= 10_000; cents++) expect(gradeToCents(centsToGrade(cents))).toBe(cents);
  });

  it("011/SC-004 soma = total, máx − mín ≤ 1 e não crescente, de 1 a 1 000 centésimos × 1–10 questões", () => {
    for (let total = 1; total <= 1_000; total++) {
      for (let count = 1; count <= Math.min(10, total); count++) expectFairSplit(total, count);
    }
  });

  it("011/SC-004 a mesma propriedade, amostrada até 10 000 centésimos", () => {
    for (let total = 1_000; total <= 10_000; total += 37) {
      for (let count = 1; count <= 10; count++) expectFairSplit(total, count);
    }
    for (let count = 1; count <= 10; count++) expectFairSplit(10_000, count);
  });
});
