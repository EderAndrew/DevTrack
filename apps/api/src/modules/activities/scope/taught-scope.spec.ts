import { describe, expect, it } from "vitest";
import type { SnapshotQuestion } from "../snapshot/snapshot";
import { checkTaughtScope } from "./taught-scope";

const question = (position: number, topicItemIds: string[]): SnapshotQuestion => ({
  position,
  type: "OPEN_ANSWER",
  gradingStrategy: "AI_REVIEW",
  valueCents: 10,
  statement: "x",
  instructions: null,
  starterCode: null,
  languageId: null,
  expectedAnswer: "y",
  rubric: null,
  expectedSolution: null,
  explanation: null,
  isTrickQuestion: false,
  sourceExerciseId: null,
  alternatives: [],
  testCases: [],
  topicItemIds,
});

const titles = new Map([
  ["heranca", "Herança"],
  ["polimorfismo", "Polimorfismo"],
  ["interfaces", "Interfaces"],
]);

describe("012/FR-005a escopo ensinado da turma (constituição XXIII)", () => {
  const questions = [question(0, ["heranca"]), question(1, ["polimorfismo", "interfaces"]), question(2, ["interfaces"]), question(3, [])];

  it("tópicos fora dos concluídos são sinalizados com as posições das questões; os ensinados não", () => {
    expect(checkTaughtScope(questions, new Set(["heranca"]), titles)).toEqual({
      hasPlan: true,
      outOfScope: [
        { syllabusItemId: "polimorfismo", title: "Polimorfismo", questionPositions: [1] },
        { syllabusItemId: "interfaces", title: "Interfaces", questionPositions: [1, 2] },
      ],
    });
  });

  it("tudo ensinado → nada sinalizado", () => {
    expect(checkTaughtScope(questions, new Set(["heranca", "polimorfismo", "interfaces"]), titles)).toEqual({ hasPlan: true, outOfScope: [] });
  });

  it("turma sem planejamento → todos os tópicos sinalizados e hasPlan falso", () => {
    const check = checkTaughtScope(questions, null, titles);
    expect(check.hasPlan).toBe(false);
    expect(check.outOfScope.map((topic) => topic.syllabusItemId)).toEqual(["heranca", "polimorfismo", "interfaces"]);
  });

  it("questões sem tópico não sinalizam nada", () => {
    expect(checkTaughtScope([question(0, [])], null, titles)).toEqual({ hasPlan: false, outOfScope: [] });
  });
});
