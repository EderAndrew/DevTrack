import { NO_TYPE_COLUMNS, NO_TYPE_FIELDS, type ExerciseTypeDefinition } from "./definition";

/** Pergunta e resposta (010/FR-003): the expected answer is the teacher's only. */
export const OPEN_ANSWER: ExerciseTypeDefinition<"OPEN_ANSWER"> = {
  type: "OPEN_ANSWER",
  violations: () => [],
  columns: (input) => ({ ...NO_TYPE_COLUMNS, expectedAnswer: input.expectedAnswer }),
  alternatives: () => [],
  teacherFields: (record) => ({ ...NO_TYPE_FIELDS, expectedAnswer: record.expectedAnswer }),
  studentFields: () => ({}),
};
