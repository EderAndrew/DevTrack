import { NO_TYPE_COLUMNS, NO_TYPE_FIELDS, type ExerciseTypeDefinition, type StudentTypeFields } from "./definition";

/**
 * Exercício de código (010/FR-005): instructions, optional starter code, expected solution and a
 * language of the catalog (whether it is active is checked against the database). Nothing is
 * executed. The student sees the instructions, the starter code and the language, never the solution.
 */
export const CODE: ExerciseTypeDefinition<"CODE"> = {
  type: "CODE",
  violations: () => [],
  columns: (input) => ({
    ...NO_TYPE_COLUMNS,
    instructions: input.instructions,
    starterCode: input.starterCode ?? null,
    expectedSolution: input.expectedSolution,
    languageId: input.languageId,
  }),
  alternatives: () => [],
  teacherFields: (record) => ({
    ...NO_TYPE_FIELDS,
    instructions: record.instructions,
    starterCode: record.starterCode,
    expectedSolution: record.expectedSolution,
    language: record.language ? { id: record.language.id, name: record.language.name } : null,
  }),
  studentFields: (record) => {
    const fields: StudentTypeFields = {};
    if (record.instructions !== null) fields.instructions = record.instructions;
    if (record.starterCode !== null) fields.starterCode = record.starterCode;
    if (record.language) fields.language = { name: record.language.name };
    return fields;
  },
};
