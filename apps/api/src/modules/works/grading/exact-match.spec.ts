import { describe, expect, it } from "vitest";
import { exactMatch } from "./exact-match";
import type { ExactMatchQuestion } from "./strategy";
import { NO_PORTS } from "../../../../test/fixtures/works/grading-ports";
import { computeWorkGrade } from "./work-grade";

const CORRECT = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const WRONG = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d11";

const question = (n = 1, valueCents = 5): ExactMatchQuestion => ({
  strategy: "EXACT_MATCH",
  id: `3f8a1c52-6b1e-4c4b-9d0e-${String(n).padStart(12, "0")}`,
  valueCents,
  correctAlternativeId: CORRECT,
});

describe("011/FR-037 EXACT_MATCH: a alternativa escolhida comparada no servidor, sem IA", () => {
  it("011/US8-1 correta → o valor (0,05); incorreta ou em branco → 0,00; nenhuma porta é chamada", async () => {
    await expect(exactMatch.grade(question(), { kind: "ALTERNATIVE", alternativeId: CORRECT }, NO_PORTS)).resolves.toEqual({
      questionId: question().id,
      strategy: "EXACT_MATCH",
      valueCents: 5,
      status: "GRADED",
      nature: "RULE_RESULT",
      suggestedCents: null,
      teacherCents: null,
      finalCents: 5,
      pendingReason: null,
    });
    for (const alternativeId of [WRONG, null]) {
      const grading = await exactMatch.grade(question(), { kind: "ALTERNATIVE", alternativeId }, NO_PORTS);
      expect(grading).toMatchObject({ status: "GRADED", nature: "RULE_RESULT", finalCents: 0 });
    }
  });

  it("011/US8-2 trabalho de 0,50 com 10 questões de 0,05: 9 acertos → 0,45; 8 → 0,40", async () => {
    const questions = Array.from({ length: 10 }, (_, i) => question(i + 1));
    const grade = async (correct: number) => {
      const gradings = await Promise.all(
        questions.map((q, i) => exactMatch.grade(q, { kind: "ALTERNATIVE", alternativeId: i < correct ? CORRECT : WRONG }, NO_PORTS)),
      );
      return computeWorkGrade(gradings, 50);
    };
    await expect(grade(9)).resolves.toEqual({ cents: 45, partial: false });
    await expect(grade(8)).resolves.toEqual({ cents: 40, partial: false });
  });

  it("uma resposta que não é de alternativa é erro de quem chama, nunca uma nota", async () => {
    await expect(exactMatch.grade(question(), { kind: "TEXT", text: CORRECT }, NO_PORTS)).rejects.toMatchObject({ code: "ANSWER_KIND_MISMATCH" });
  });
});
