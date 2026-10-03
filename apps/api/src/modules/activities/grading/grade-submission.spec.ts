import type { Answer } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { blankAnswer, type GradingQuestion, gradeSubmission } from "./grade-submission";

const CORRECT = "00000000-0000-4000-8000-0000000000c1";
const WRONG = "00000000-0000-4000-8000-0000000000c2";

const question = (id: string, type: GradingQuestion["type"], valueCents: number, extra: Partial<GradingQuestion> = {}): GradingQuestion => ({
  id,
  type,
  gradingStrategy: type === "MULTIPLE_CHOICE" ? "EXACT_MATCH" : type === "CODE" ? "TEST_CASES" : "AI_REVIEW",
  valueCents,
  statement: "Enunciado",
  expectedAnswer: type === "OPEN_ANSWER" ? "Herança" : null,
  rubric: null,
  languageKey: type === "CODE" ? "java" : null,
  correctAlternativeId: type === "MULTIPLE_CHOICE" ? CORRECT : null,
  testCases: [],
  ...extra,
});

const QUESTIONS = [
  question("mc1", "MULTIPLE_CHOICE", 20),
  question("mc2", "MULTIPLE_CHOICE", 20),
  question("mc3", "MULTIPLE_CHOICE", 10),
  question("open", "OPEN_ANSWER", 20),
  question("code-no-tests", "CODE", 15),
  question("code-tests", "CODE", 15, { testCases: [{ input: "1", expectedOutput: "2" }] }),
];

describe("012/FR-027 012/FR-028 correção no registro da entrega, sem IA e sem Code Runner", () => {
  it("012/US4-1 Múltipla escolha certa = valor, errada e em branco = 0; aberta e código pendentes com o motivo; nota parcial", async () => {
    const answers = new Map<string, Answer>([
      ["mc1", { kind: "ALTERNATIVE", alternativeId: CORRECT }],
      ["mc2", { kind: "ALTERNATIVE", alternativeId: WRONG }],
      ["open", { kind: "TEXT", text: "Reuso de código" }],
      ["code-tests", { kind: "CODE", source: "class A {}" }],
    ]);
    const result = await gradeSubmission(QUESTIONS, answers, 100);
    expect(result.gradings.map((g) => [g.questionId, g.status, g.finalCents, g.pendingReason])).toEqual([
      ["mc1", "GRADED", 20, null],
      ["mc2", "GRADED", 0, null],
      ["mc3", "GRADED", 0, null],
      ["open", "PENDING_TEACHER", null, "AI_REVIEW_UNAVAILABLE"],
      ["code-no-tests", "PENDING_TEACHER", null, "NO_TEST_CASES"],
      ["code-tests", "PENDING_TEACHER", null, "CODE_RUNNER_UNAVAILABLE"],
    ]);
    expect(result).toMatchObject({ gradeCents: 20, partial: true });
    expect(result.gradings.filter((g) => g.status === "GRADED").every((g) => g.nature === "RULE_RESULT")).toBe(true);
  });

  it("aberta e código em branco ficam pendentes, nunca 0 automático (011/FR-040)", async () => {
    const result = await gradeSubmission(QUESTIONS, new Map(), 100);
    expect(result.gradings.filter((g) => g.finalCents === 0).map((g) => g.questionId)).toEqual(["mc1", "mc2", "mc3"]);
    expect(result.gradings.filter((g) => g.status === "PENDING_TEACHER")).toHaveLength(3);
  });

  it("só Múltipla escolha → nota completa (não parcial)", async () => {
    const onlyChoice = QUESTIONS.slice(0, 2);
    const result = await gradeSubmission(onlyChoice, new Map([["mc1", { kind: "ALTERNATIVE", alternativeId: CORRECT } as Answer]]), 40);
    expect(result).toMatchObject({ gradeCents: 20, partial: false });
  });

  it("o branco de cada tipo é do tipo certo", () => {
    expect(blankAnswer("MULTIPLE_CHOICE")).toEqual({ kind: "ALTERNATIVE", alternativeId: null });
    expect(blankAnswer("OPEN_ANSWER")).toEqual({ kind: "TEXT", text: "" });
    expect(blankAnswer("CODE")).toEqual({ kind: "CODE", source: "" });
  });
});
