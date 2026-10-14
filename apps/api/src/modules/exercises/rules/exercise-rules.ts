import { type ExerciseInput, ExerciseInputSchema, type ExamRuleViolation } from "@repo/contracts";
import { AppException } from "../../../platform/http/errors";
import { searchKey } from "../../../platform/text/search-key";
import { type AlternativeRow, type ExerciseRuleViolation, type ExerciseTypeColumns, exerciseType, type TestCaseRow } from "../types";

/**
 * The structural rules of one exercise (010/FR-006, research X4), the same for manual input,
 * edits and the AI output: the contract's schema and refinements first, then the type's own rules.
 * Pure: whether a language is active or a topic is the teacher's needs the database.
 */
export function checkExercise(value: unknown): { input: ExerciseInput; violations: [] } | { input: null; violations: ExerciseRuleViolation[] } {
  const parsed = ExerciseInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      input: null,
      violations: parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "exercise", reason: issue.code === "custom" ? issue.message : issue.code })),
    };
  }
  const violations = exerciseViolations(parsed.data);
  return violations.length === 0 ? { input: parsed.data, violations: [] } : { input: null, violations };
}

/** The type's rules on an input the contract already parsed. */
export function exerciseViolations(input: ExerciseInput): ExerciseRuleViolation[] {
  return exerciseType(input.type).violations(input);
}

/**
 * The test-case rules the server names (019/FR-001, contracts/http-api.md `422 EXERCISE_RULES`): only a
 * CODE exercise has cases, and no case has an empty expected output. The count and the sizes are the
 * contract's (a 400). Codes and paths only, never a case's text.
 */
export function testCaseViolations(input: ExerciseInput): ExerciseRuleViolation[] {
  const cases = input.testCases ?? [];
  if (cases.length === 0) return [];
  if (input.type !== "CODE") return [{ field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" }];
  return cases.flatMap((testCase, index) =>
    testCase.expectedOutput === "" ? [{ field: `testCases.${index}.expectedOutput`, reason: "TEST_CASE_EXPECTED_OUTPUT" }] : [],
  );
}

/**
 * `422 EXERCISE_RULES` for the test-case rules of every input, each violation pointing at the
 * exercise's index in the request; null when there is none.
 */
export function exerciseRulesError(inputs: readonly ExerciseInput[]): AppException | null {
  const violations: ExamRuleViolation[] = inputs.flatMap((input, position) =>
    testCaseViolations(input).map(({ field, reason }) => ({ position, field, reason })),
  );
  return violations.length === 0 ? null : new AppException("EXERCISE_RULES", undefined, {}, { violations });
}

export interface ExerciseContentRows {
  statement: string;
  statementSearchKey: string;
  explanation: string;
  columns: ExerciseTypeColumns;
  alternatives: AlternativeRow[];
  /** 019: the whole list, replaced on each save (research B16). */
  testCases: TestCaseRow[];
}

/** What an input writes: the common text, the type's columns, its alternatives and its test cases. */
export function exerciseContentRows(input: ExerciseInput): ExerciseContentRows {
  const definition = exerciseType(input.type);
  return {
    statement: input.statement,
    statementSearchKey: searchKey(input.statement),
    explanation: input.explanation,
    columns: definition.columns(input),
    alternatives: definition.alternatives(input),
    testCases: (input.testCases ?? []).map((testCase, position) => ({ position, ...testCase })),
  };
}

/** The `exercise.created`/`exercise.edited` counts of the list (019 contracts/audit-events.md "Changed"). */
export function testCaseCounts(rows: readonly TestCaseRow[]): { testCaseCount: number; publicTestCaseCount: number } {
  return { testCaseCount: rows.length, publicTestCaseCount: rows.filter((row) => row.visibility === "PUBLIC").length };
}
