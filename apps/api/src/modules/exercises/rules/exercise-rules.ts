import { type ExerciseInput, ExerciseInputSchema } from "@repo/contracts";
import { searchKey } from "../../../platform/text/search-key";
import { type AlternativeRow, type ExerciseRuleViolation, type ExerciseTypeColumns, exerciseType } from "../types";

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

export interface ExerciseContentRows {
  statement: string;
  statementSearchKey: string;
  explanation: string;
  columns: ExerciseTypeColumns;
  alternatives: AlternativeRow[];
}

/** What an input writes: the common text, the type's columns and its alternatives. */
export function exerciseContentRows(input: ExerciseInput): ExerciseContentRows {
  const definition = exerciseType(input.type);
  return {
    statement: input.statement,
    statementSearchKey: searchKey(input.statement),
    explanation: input.explanation,
    columns: definition.columns(input),
    alternatives: definition.alternatives(input),
  };
}
