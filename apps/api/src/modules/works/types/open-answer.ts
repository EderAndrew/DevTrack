import { filled, NO_TYPE_COLUMNS, type WorkQuestionTypeDefinition } from "./definition";

/**
 * Resposta aberta (011/FR-003): the expected answer and an optional rubric are the teacher's only.
 * Graded by the AI review, whose result is a suggestion (research W7).
 */
export const OPEN_ANSWER: WorkQuestionTypeDefinition<"OPEN_ANSWER"> = {
  type: "OPEN_ANSWER",
  gradingStrategy: "AI_REVIEW",
  violations: () => [],
  columns: (input) => ({ ...NO_TYPE_COLUMNS, expectedAnswer: input.expectedAnswer, rubric: input.rubric ?? null }),
  alternatives: () => [],
  testCases: () => [],
  answerKeyComplete: (record) => filled(record.expectedAnswer),
  lacksTestCases: () => false,
  teacherFields: (record) => ({ expectedAnswer: record.expectedAnswer ?? "", rubric: record.rubric }),
  studentFields: () => ({}),
};
