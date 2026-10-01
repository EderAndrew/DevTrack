import { describe, expect, it } from "vitest";
import type { WorkQuestionRecord } from "../types";
import { answerKeysComplete, checkWorkQuestion, duplicateStatementPositions, workWarnings } from "./work-rules";

const LANGUAGE_ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";

const question = (overrides: Partial<WorkQuestionRecord>): WorkQuestionRecord => ({
  id: "0d4e5f60-7a8b-4c9d-8e0f-112233445566",
  position: 0,
  type: "CODE",
  gradingStrategy: "TEST_CASES",
  statement: "Some",
  explanation: null,
  valueCents: 10,
  expectedAnswer: null,
  rubric: null,
  instructions: null,
  starterCode: null,
  expectedSolution: "a + b",
  language: { id: LANGUAGE_ID, name: "Java" },
  isTrickQuestion: false,
  alternatives: [],
  testCases: [],
  topicItemIds: [],
  ...overrides,
});

describe("011 regras puras do trabalho (research W6, W15)", () => {
  it("011/FR-008 aplica o contrato e as regras do tipo, com o campo e o motivo", () => {
    expect(checkWorkQuestion({ type: "OPEN_ANSWER", statement: "S", expectedAnswer: "R" }).violations).toEqual([]);
    const twoCorrect = checkWorkQuestion({
      type: "MULTIPLE_CHOICE",
      statement: "S",
      alternatives: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: true },
        { text: "C", isCorrect: false },
      ],
    });
    expect(twoCorrect).toEqual({ input: null, violations: [{ field: "alternatives", reason: "CORRECT_COUNT" }] });
    expect(checkWorkQuestion({ type: "CODE", statement: "S", expectedSolution: "x" }).violations).toEqual([
      { field: "languageId", reason: "invalid_type" },
    ]);
  });

  it("enunciados repetidos, ignorando maiúsculas, acentos e espaços, são apontados pela posição", () => {
    expect(duplicateStatementPositions(["Explique herança", "  explique  HERANÇA ", "Outro", "outro"])).toEqual([1, 3]);
    expect(duplicateStatementPositions(["A", "B"])).toEqual([]);
  });

  it("011/FR-007 aviso CODE_QUESTION_WITHOUT_TEST_CASES com as posições das questões de código sem casos de teste", () => {
    const withCases = question({
      position: 0,
      testCases: [{ id: "0d4e5f60-7a8b-4c9d-8e0f-112233445500", position: 0, input: "", expectedOutput: "", visibility: "PUBLIC" }],
    });
    expect(workWarnings([withCases])).toEqual([]);
    expect(workWarnings([question({ position: 2 }), withCases, question({ position: 1 })])).toEqual([
      { code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions: [1, 2] },
    ]);
  });

  it("011/FR-015 a aprovação exige o gabarito de todas as questões", () => {
    expect(answerKeysComplete([question({})])).toBe(true);
    expect(answerKeysComplete([question({}), question({ expectedSolution: null })])).toBe(false);
    expect(answerKeysComplete([question({ type: "OPEN_ANSWER", gradingStrategy: "AI_REVIEW", expectedAnswer: "" })])).toBe(false);
  });
});
