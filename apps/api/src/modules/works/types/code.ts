import { byPosition, filled, NO_TYPE_COLUMNS, type StudentQuestionTypeFields, type WorkQuestionTypeDefinition } from "./definition";

/**
 * Código (011/FR-003): optional instructions and starter code, the expected solution, a language
 * of the catalog (whether it is active is checked against the database) and 0–20 test cases.
 * Graded by the test cases; nothing is executed in 011 (research W20). The student sees the
 * instructions, the starter code, the language and the PUBLIC test cases, never the solution.
 */
export const CODE: WorkQuestionTypeDefinition<"CODE"> = {
  type: "CODE",
  gradingStrategy: "TEST_CASES",
  violations: () => [],
  columns: (input) => ({
    ...NO_TYPE_COLUMNS,
    instructions: input.instructions ?? null,
    starterCode: input.starterCode ?? null,
    expectedSolution: input.expectedSolution,
    languageId: input.languageId,
  }),
  alternatives: () => [],
  testCases: (input) =>
    input.testCases.map((testCase, position) => ({
      position,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      visibility: testCase.visibility,
    })),
  answerKeyComplete: (record) => filled(record.expectedSolution) && record.language !== null,
  lacksTestCases: (record) => record.testCases.length === 0,
  teacherFields: (record) => ({
    instructions: record.instructions,
    starterCode: record.starterCode,
    expectedSolution: record.expectedSolution ?? "",
    ...(record.language
      ? { language: { id: record.language.id, name: record.language.name, highlight: record.language.highlight } }
      : {}),
    testCases: byPosition(record.testCases).map(({ id, position, input, expectedOutput, visibility }) => ({
      id,
      position,
      input,
      expectedOutput,
      visibility,
    })),
  }),
  studentFields: (record) => {
    const fields: StudentQuestionTypeFields = {
      publicTestCases: byPosition(record.testCases)
        .filter((testCase) => testCase.visibility === "PUBLIC")
        .map((testCase) => ({ input: testCase.input, expectedOutput: testCase.expectedOutput })),
    };
    if (record.instructions !== null) fields.instructions = record.instructions;
    if (record.starterCode !== null) fields.starterCode = record.starterCode;
    if (record.language) fields.language = { name: record.language.name, highlight: record.language.highlight };
    return fields;
  },
};
