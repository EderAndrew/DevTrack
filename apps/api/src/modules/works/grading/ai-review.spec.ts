import { describe, expect, it } from "vitest";
import { FakeAiReview, NO_PORTS } from "../../../../test/fixtures/works/grading-ports";
import { aiReview } from "./ai-review";
import { decideByTeacher } from "./decide";
import type { AiReviewOutcome, AiReviewQuestion, GradingPorts } from "./strategy";

const question: AiReviewQuestion = {
  strategy: "AI_REVIEW",
  id: "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10",
  valueCents: 5,
  statement: "O que é herança?",
  expectedAnswer: "Reuso de comportamento de uma superclasse.",
  rubric: "Cita superclasse e reuso.",
};
const suggested = (suggestedCents: number): AiReviewOutcome => ({
  kind: "SUGGESTED",
  suggestedCents,
  justification: "Cita reuso, não cita superclasse.",
  feedback: "Faltou a superclasse.",
  confidence: 0.8,
});
const ports = (review: FakeAiReview): GradingPorts => ({ ...NO_PORTS, aiReview: review });
const answer = { kind: "TEXT", text: "Reaproveitar código." } as const;

describe("011/FR-039 AI_REVIEW: a IA sugere, o professor decide", () => {
  it("011/US8-5 011/SC-011 sugestão 0,04 de 0,05 → SUGGESTED sem nota final; o professor decide 0,05 → nota final 0,05", async () => {
    const review = new FakeAiReview(suggested(4));
    const grading = await aiReview.grade(question, answer, ports(review));
    expect(grading).toEqual({
      questionId: question.id,
      strategy: "AI_REVIEW",
      valueCents: 5,
      status: "SUGGESTED",
      nature: "SUGGESTION",
      suggestedCents: 4,
      teacherCents: null,
      finalCents: null,
      pendingReason: null,
    });
    expect(review.calls).toEqual([
      { statement: question.statement, expectedAnswer: question.expectedAnswer, rubric: question.rubric, valueCents: 5, answer: answer.text },
    ]);

    expect(decideByTeacher(grading, 5)).toEqual({
      ...grading,
      status: "DECIDED",
      nature: "HUMAN_DECISION",
      teacherCents: 5,
      finalCents: 5,
    });
  });

  it("011/US8-6 011/FR-040 sugestão que falhou (IA indisponível ou resposta inválida) → professor, nunca 0", async () => {
    const grading = await aiReview.grade(question, answer, ports(new FakeAiReview({ kind: "FAILED" })));
    expect(grading).toMatchObject({ status: "PENDING_TEACHER", nature: null, suggestedCents: null, finalCents: null, pendingReason: "AI_REVIEW_FAILED" });
  });

  it("012/FR-027 sem revisor de IA (a 012 não usa IA) → professor, com o motivo AI_REVIEW_UNAVAILABLE, nunca 0", async () => {
    const grading = await aiReview.grade(question, answer, ports(new FakeAiReview({ kind: "UNAVAILABLE" })));
    expect(grading).toMatchObject({
      status: "PENDING_TEACHER",
      nature: null,
      suggestedCents: null,
      finalCents: null,
      pendingReason: "AI_REVIEW_UNAVAILABLE",
    });
  });

  it("011/US8-7 sugestão fora de 0…valor (ou fora dos centésimos) → professor, sem guardar a sugestão", async () => {
    for (const cents of [6, -1, 2.5]) {
      const grading = await aiReview.grade(question, answer, ports(new FakeAiReview(suggested(cents))));
      expect(grading).toMatchObject({ status: "PENDING_TEACHER", suggestedCents: null, finalCents: null, pendingReason: "AI_REVIEW_OUT_OF_RANGE" });
    }
    for (const cents of [0, 5]) {
      await expect(aiReview.grade(question, answer, ports(new FakeAiReview(suggested(cents))))).resolves.toMatchObject({ status: "SUGGESTED", suggestedCents: cents });
    }
  });

  it("uma resposta que não é texto é erro de quem chama", async () => {
    await expect(aiReview.grade(question, { kind: "CODE", source: "x" }, ports(new FakeAiReview(suggested(4))))).rejects.toMatchObject({
      code: "ANSWER_KIND_MISMATCH",
    });
  });
});
