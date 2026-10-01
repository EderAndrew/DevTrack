import { WORK_ALTERNATIVES_MAX, WORK_ALTERNATIVES_MIN, workAlternativesProblem } from "@repo/contracts";
import { byPosition, NO_TYPE_COLUMNS, type WorkQuestionTypeDefinition } from "./definition";

/**
 * Múltipla escolha (011/FR-003): 3–5 alternatives in the given order, exactly one correct,
 * distinct texts; the trick-question flag. Graded by exact match. The student sees the texts only.
 */
export const MULTIPLE_CHOICE: WorkQuestionTypeDefinition<"MULTIPLE_CHOICE"> = {
  type: "MULTIPLE_CHOICE",
  gradingStrategy: "EXACT_MATCH",
  violations: (input) => {
    const count = input.alternatives.length;
    if (count < WORK_ALTERNATIVES_MIN || count > WORK_ALTERNATIVES_MAX) return [{ field: "alternatives", reason: "ALTERNATIVE_COUNT" }];
    const problem = workAlternativesProblem(input.alternatives);
    return problem ? [{ field: "alternatives", reason: problem }] : [];
  },
  columns: (input) => ({ ...NO_TYPE_COLUMNS, isTrickQuestion: input.isTrickQuestion }),
  alternatives: (input) => input.alternatives.map((alternative, position) => ({ position, text: alternative.text, isCorrect: alternative.isCorrect })),
  testCases: () => [],
  answerKeyComplete: (record) => {
    const count = record.alternatives.length;
    return count >= WORK_ALTERNATIVES_MIN && count <= WORK_ALTERNATIVES_MAX && record.alternatives.filter((a) => a.isCorrect).length === 1;
  },
  lacksTestCases: () => false,
  teacherFields: (record) => ({
    alternatives: byPosition(record.alternatives).map(({ id, position, text, isCorrect }) => ({ id, position, text, isCorrect })),
  }),
  studentFields: (record) => ({
    alternatives: byPosition(record.alternatives).map((alternative) => ({ id: alternative.id, text: alternative.text })),
  }),
};
