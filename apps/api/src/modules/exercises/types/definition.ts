import type {
  CognitiveObjective,
  ExerciseDifficulty,
  ExerciseInput,
  ExerciseOrigin,
  ExerciseStatus,
  ExerciseStudentView,
  ExerciseTeacherView,
  ExerciseTopicView,
  ExerciseType,
  TestCaseVisibility,
} from "@repo/contracts";

/**
 * An exercise as read from the database with what its views need (010 research X3, X12). The
 * query layer builds it; the types and views below stay pure.
 */
export interface ExerciseRecord {
  id: string;
  type: ExerciseType;
  statement: string;
  explanation: string;
  difficulty: ExerciseDifficulty;
  cognitiveObjective: CognitiveObjective;
  origin: ExerciseOrigin;
  status: ExerciseStatus;
  archivedFromStatus: ExerciseStatus | null;
  version: number;
  expectedAnswer: string | null;
  instructions: string | null;
  starterCode: string | null;
  expectedSolution: string | null;
  isTrickQuestion: boolean;
  humanReviewed: boolean;
  humanEdited: boolean;
  reviewedAt: Date | null;
  generationBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
  language: { id: string; name: string; highlight: string | null } | null;
  /** Any order; the views sort by position. */
  alternatives: { id: string; text: string; isCorrect: boolean; position: number }[];
  /** 019: CODE only; any order, the teacher view sorts by position. Never in a student view. */
  testCases: { position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
  reviewedBy: { name: string } | null;
  topic: ExerciseTopicView | null;
}

/** The `exercises` columns that belong to one type or another (null for the other types). */
export interface ExerciseTypeColumns {
  expectedAnswer: string | null;
  instructions: string | null;
  starterCode: string | null;
  expectedSolution: string | null;
  languageId: string | null;
  isTrickQuestion: boolean;
}

/** A row of `exercise_test_cases` to write (019 research B16), 0-based position in the list's order. */
export interface TestCaseRow {
  position: number;
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
}

/** A row of `exercise_alternatives` to write, 0-based position in presentation order. */
export interface AlternativeRow {
  position: number;
  text: string;
  isCorrect: boolean;
}

/** A rule an exercise breaks, with the field it points at (for the error and the AI validation). */
export interface ExerciseRuleViolation {
  field: string;
  reason: string;
}

export type TeacherTypeFields = Pick<
  ExerciseTeacherView,
  "expectedAnswer" | "instructions" | "starterCode" | "expectedSolution" | "language" | "alternatives" | "isTrickQuestion"
>;

export type StudentTypeFields = Pick<ExerciseStudentView, "instructions" | "starterCode" | "language" | "alternatives">;

/**
 * One exercise type (010/FR-001, research X3): its structural rules, how it maps to rows and what
 * each view shows. A new type is a new definition, its columns and its contract variant.
 */
export interface ExerciseTypeDefinition<T extends ExerciseType = ExerciseType> {
  type: T;
  /** Rules beyond the contract's refinements; the contract has already parsed `input`. */
  violations(input: Extract<ExerciseInput, { type: T }>): ExerciseRuleViolation[];
  columns(input: Extract<ExerciseInput, { type: T }>): ExerciseTypeColumns;
  alternatives(input: Extract<ExerciseInput, { type: T }>): AlternativeRow[];
  teacherFields(record: ExerciseRecord): TeacherTypeFields;
  /** Allowlist: copies only what a student may see (FR-036). */
  studentFields(record: ExerciseRecord): StudentTypeFields;
}

/** Fields no type uses, as the teacher view shows them. */
export const NO_TYPE_FIELDS: TeacherTypeFields = {
  expectedAnswer: null,
  instructions: null,
  starterCode: null,
  expectedSolution: null,
  language: null,
  alternatives: [],
  isTrickQuestion: false,
};

export const NO_TYPE_COLUMNS: ExerciseTypeColumns = {
  expectedAnswer: null,
  instructions: null,
  starterCode: null,
  expectedSolution: null,
  languageId: null,
  isTrickQuestion: false,
};

export function byPosition<T extends { position: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}
