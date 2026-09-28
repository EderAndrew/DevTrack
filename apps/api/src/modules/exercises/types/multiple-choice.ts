import { ALTERNATIVES_MAX, ALTERNATIVES_MIN, alternativesProblem } from "@repo/contracts";
import { byPosition, NO_TYPE_COLUMNS, NO_TYPE_FIELDS, type ExerciseTypeDefinition } from "./definition";

/**
 * Múltipla escolha (010/FR-004): 3–5 alternatives in the given order, exactly one correct,
 * distinct texts; the trick-question flag. The student sees the texts only.
 */
export const MULTIPLE_CHOICE: ExerciseTypeDefinition<"MULTIPLE_CHOICE"> = {
  type: "MULTIPLE_CHOICE",
  violations: (input) => {
    const count = input.alternatives.length;
    if (count < ALTERNATIVES_MIN || count > ALTERNATIVES_MAX) return [{ field: "alternatives", reason: "ALTERNATIVE_COUNT" }];
    const problem = alternativesProblem(input.alternatives);
    return problem ? [{ field: "alternatives", reason: problem }] : [];
  },
  columns: (input) => ({ ...NO_TYPE_COLUMNS, isTrickQuestion: input.isTrickQuestion }),
  alternatives: (input) => input.alternatives.map((alternative, position) => ({ position, ...alternative })),
  teacherFields: (record) => ({
    ...NO_TYPE_FIELDS,
    alternatives: byPosition(record.alternatives).map(({ id, text, isCorrect, position }) => ({ id, text, isCorrect, position })),
    isTrickQuestion: record.isTrickQuestion,
  }),
  studentFields: (record) => ({
    alternatives: byPosition(record.alternatives).map((alternative) => ({ id: alternative.id, text: alternative.text })),
  }),
};
