import { distributeGrade, type QuestionGrading, QuestionGradingSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { computeWorkGrade } from "./work-grade";

const grading = (valueCents: number, finalCents: number | null): QuestionGrading => ({
  questionId: "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10",
  strategy: "EXACT_MATCH",
  valueCents,
  status: finalCents === null ? "PENDING_TEACHER" : "GRADED",
  nature: finalCents === null ? null : "RULE_RESULT",
  suggestedCents: null,
  teacherCents: null,
  finalCents,
  pendingReason: finalCents === null ? "CODE_RUNNER_UNAVAILABLE" : null,
});

/** A small deterministic generator (mulberry32), so a failing case can be replayed from its seed. */
function random(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max + 1));
  };
}

describe("011/FR-041 a nota do aluno no trabalho", () => {
  it("011/US8-7 soma as notas finais; questões sem nota final não entram e deixam a nota parcial (nunca contam 0 por padrão)", () => {
    expect(computeWorkGrade([grading(5, 5), grading(5, 3)], 10)).toEqual({ cents: 8, partial: false });
    expect(computeWorkGrade([grading(5, 5), grading(5, null)], 10)).toEqual({ cents: 5, partial: true });
    expect(computeWorkGrade([grading(5, null), grading(5, null)], 10)).toEqual({ cents: 0, partial: true });
  });

  it("uma nota final fora de 0…valor ou uma soma acima da nota total é recusada", () => {
    expect(() => computeWorkGrade([grading(5, 6)], 5)).toThrow(expect.objectContaining({ code: "GRADE_OUT_OF_RANGE" }));
    expect(() => computeWorkGrade([grading(5, 5), grading(5, 5)], 9)).toThrow(expect.objectContaining({ code: "GRADE_OUT_OF_RANGE" }));
  });

  it("011/US8-7 propriedade: para quaisquer notas finais válidas, 0 ≤ nota ≤ total e parcial ⇔ há questão sem nota final", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = random(seed);
      const count = 1 + next(9);
      const totalCents = count + next(10_000 - count);
      const gradings = distributeGrade(totalCents, count).map((value) => grading(value, next(3) === 0 ? null : next(value)));
      for (const item of gradings) expect(QuestionGradingSchema.safeParse(item).success, `seed ${seed}`).toBe(true);
      const result = computeWorkGrade(gradings, totalCents);
      expect(result.cents, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(result.cents, `seed ${seed}`).toBeLessThanOrEqual(totalCents);
      expect(Number.isInteger(result.cents)).toBe(true);
      expect(result.partial, `seed ${seed}`).toBe(gradings.some((item) => item.finalCents === null));
      expect(result.cents).toBe(gradings.reduce((sum, item) => sum + (item.finalCents ?? 0), 0));
    }
  });
});
