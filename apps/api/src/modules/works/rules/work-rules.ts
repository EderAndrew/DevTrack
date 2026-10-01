import { type WorkQuestionInput, WorkQuestionInputSchema, type WorkWarning } from "@repo/contracts";
import { searchKey } from "../../../platform/text/search-key";
import {
  type AnyWorkQuestionInput,
  byPosition,
  type WorkAlternativeRow,
  type WorkQuestionRecord,
  type WorkQuestionTypeColumns,
  type WorkRuleViolation,
  type WorkTestCaseRow,
  workQuestionType,
} from "../types";

/**
 * The structural rules of one question (011/FR-008, research W6), the same for manual input,
 * edits and the AI output: the contract's schema and refinements first, then the type's own rules.
 * Pure: whether a language is active or a topic is the teacher's needs the database.
 */
export function checkWorkQuestion(
  value: unknown,
): { input: WorkQuestionInput; violations: [] } | { input: null; violations: WorkRuleViolation[] } {
  const parsed = WorkQuestionInputSchema.safeParse(value);
  if (!parsed.success) {
    return {
      input: null,
      violations: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "question",
        reason: issue.code === "custom" ? issue.message : issue.code,
      })),
    };
  }
  const violations = workQuestionViolations(parsed.data);
  return violations.length === 0 ? { input: parsed.data, violations: [] } : { input: null, violations };
}

/** The type's rules on an input the contract already parsed. */
export function workQuestionViolations(input: AnyWorkQuestionInput): WorkRuleViolation[] {
  return workQuestionType(input.type).violations(input);
}

/**
 * 0-based positions of the questions whose statement repeats an earlier one after `searchKey`
 * (case, accents and spaces ignored). A rule of the AI output (011/FR-027); a manual work may
 * repeat a statement.
 */
export function duplicateStatementPositions(statements: readonly string[]): number[] {
  const seen = new Set<string>();
  return statements.flatMap((statement, position) => {
    const key = searchKey(statement);
    if (seen.has(key)) return [position];
    seen.add(key);
    return [];
  });
}

export interface WorkQuestionContentRows {
  statement: string;
  statementSearchKey: string;
  explanation: string | null;
  gradingStrategy: ReturnType<typeof workQuestionType>["gradingStrategy"];
  columns: WorkQuestionTypeColumns;
  alternatives: WorkAlternativeRow[];
  testCases: WorkTestCaseRow[];
}

/** What a question input writes: the common text, the type's strategy, columns, alternatives and test cases. */
export function workQuestionContentRows(input: AnyWorkQuestionInput): WorkQuestionContentRows {
  const definition = workQuestionType(input.type);
  return {
    statement: input.statement,
    statementSearchKey: searchKey(input.statement),
    explanation: input.explanation ?? null,
    gradingStrategy: definition.gradingStrategy,
    columns: definition.columns(input),
    alternatives: definition.alternatives(input),
    testCases: definition.testCases(input),
  };
}

/** Every question has its answer key (approval, 011/FR-015). */
export function answerKeysComplete(questions: readonly WorkQuestionRecord[]): boolean {
  return questions.every((question) => workQuestionType(question.type).answerKeyComplete(question));
}

/**
 * The teacher-view warnings (research W15): code questions without test cases, by position. The
 * approval proceeds; the confirmation shows them (011/FR-007).
 */
export function workWarnings(questions: readonly WorkQuestionRecord[]): WorkWarning[] {
  const positions = byPosition(questions)
    .filter((question) => workQuestionType(question.type).lacksTestCases(question))
    .map((question) => question.position);
  return positions.length > 0 ? [{ code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions }] : [];
}
