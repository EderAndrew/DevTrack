import type { QuestionGrading } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { decideByTeacher } from "./decide";

const base: QuestionGrading = {
  questionId: "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10",
  strategy: "TEST_CASES",
  valueCents: 5,
  status: "PENDING_TEACHER",
  nature: null,
  suggestedCents: null,
  teacherCents: null,
  finalCents: null,
  pendingReason: "CODE_RUNNER_UNAVAILABLE",
};

describe("011/FR-039 a decisão do professor", () => {
  it("011/US8-4 resolve a pendência: nota do professor e final iguais, natureza HUMAN_DECISION, sem motivo pendente", () => {
    expect(decideByTeacher(base, 3)).toEqual({ ...base, status: "DECIDED", nature: "HUMAN_DECISION", teacherCents: 3, finalCents: 3, pendingReason: null });
  });

  it("revê um resultado da regra (a revisão do professor prevalece)", () => {
    const graded: QuestionGrading = { ...base, strategy: "EXACT_MATCH", status: "GRADED", nature: "RULE_RESULT", finalCents: 0, pendingReason: null };
    expect(decideByTeacher(graded, 5)).toMatchObject({ status: "DECIDED", nature: "HUMAN_DECISION", teacherCents: 5, finalCents: 5 });
  });

  it("011/US8-7 nota do professor fora de 0…valor, ou fora dos centésimos, é recusada", () => {
    for (const cents of [-1, 6, 2.5, Number.NaN]) {
      expect(() => decideByTeacher(base, cents)).toThrow(expect.objectContaining({ code: "GRADE_OUT_OF_RANGE" }));
    }
    expect(decideByTeacher(base, 0).finalCents).toBe(0);
    expect(decideByTeacher(base, 5).finalCents).toBe(5);
  });
});
