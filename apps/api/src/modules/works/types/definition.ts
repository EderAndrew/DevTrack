import type {
  GradeCents,
  TestCaseVisibility,
  WorkDifficulty,
  WorkGradingStrategy,
  WorkOrigin,
  WorkQuestionEdit,
  WorkQuestionStudentView,
  WorkQuestionTeacherView,
  WorkQuestionType,
  WorkStatus,
  WorkTopicView,
} from "@repo/contracts";

/** A question input of a create (no `id`) or an edit (optional `id`); the contract has parsed it. */
export type AnyWorkQuestionInput = WorkQuestionEdit;

/** A question as read from the database with what its views need (011 research W5, W14). */
export interface WorkQuestionRecord {
  id: string;
  position: number;
  type: WorkQuestionType;
  gradingStrategy: WorkGradingStrategy;
  statement: string;
  explanation: string | null;
  valueCents: GradeCents;
  expectedAnswer: string | null;
  rubric: string | null;
  instructions: string | null;
  starterCode: string | null;
  expectedSolution: string | null;
  language: { id: string; name: string; highlight: string | null } | null;
  isTrickQuestion: boolean;
  /** Any order; the views sort by position. */
  alternatives: { id: string; position: number; text: string; isCorrect: boolean }[];
  /** Any order; the views sort by position. */
  testCases: { id: string; position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
  topicItemIds: string[];
}

/** A work as read from the database (the query layer builds it; types and views stay pure). */
export interface WorkRecord {
  id: string;
  subject: { id: string; name: string };
  syllabusRevisionId: string | null;
  /** In selection order. */
  topics: WorkTopicView[];
  title: string;
  description: string | null;
  difficulty: WorkDifficulty | null;
  totalGradeCents: GradeCents;
  questionCount: number;
  origin: WorkOrigin;
  status: WorkStatus;
  archivedFromStatus: WorkStatus | null;
  version: number;
  humanReviewed: boolean;
  humanEdited: boolean;
  reviewedBy: { name: string } | null;
  reviewedAt: Date | null;
  generationRequestId: string | null;
  /** Any order; the views sort by position. */
  questions: WorkQuestionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/** The `work_questions` columns that belong to one type or another (null for the other types). */
export interface WorkQuestionTypeColumns {
  expectedAnswer: string | null;
  rubric: string | null;
  instructions: string | null;
  starterCode: string | null;
  expectedSolution: string | null;
  languageId: string | null;
  isTrickQuestion: boolean;
}

/** A row of `work_question_alternatives` to write, 0-based position in presentation order. */
export interface WorkAlternativeRow {
  position: number;
  text: string;
  isCorrect: boolean;
}

/** A row of `work_question_test_cases` to write, 0-based position. */
export interface WorkTestCaseRow {
  position: number;
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
}

/** A rule a question breaks, with the field it points at (for the error and the AI validation). */
export interface WorkRuleViolation {
  field: string;
  reason: string;
}

export type TeacherQuestionTypeFields = Pick<
  WorkQuestionTeacherView,
  "expectedAnswer" | "rubric" | "alternatives" | "instructions" | "starterCode" | "expectedSolution" | "language" | "testCases"
>;

export type StudentQuestionTypeFields = Pick<WorkQuestionStudentView, "instructions" | "starterCode" | "language" | "publicTestCases" | "alternatives">;

/**
 * One question type (011/FR-003, research W5): its fixed grading strategy (W7), its structural
 * rules, whether its answer key is complete (approval, FR-015), how it maps to rows and what each
 * view shows. A new type is a new definition, its columns and its contract variant (FR-004).
 */
export interface WorkQuestionTypeDefinition<T extends WorkQuestionType = WorkQuestionType> {
  type: T;
  gradingStrategy: WorkGradingStrategy;
  /** Rules beyond the contract's refinements; the contract has already parsed `input`. */
  violations(input: Extract<AnyWorkQuestionInput, { type: T }>): WorkRuleViolation[];
  columns(input: Extract<AnyWorkQuestionInput, { type: T }>): WorkQuestionTypeColumns;
  alternatives(input: Extract<AnyWorkQuestionInput, { type: T }>): WorkAlternativeRow[];
  testCases(input: Extract<AnyWorkQuestionInput, { type: T }>): WorkTestCaseRow[];
  /** Every field the type needs to be graded is there (FR-015). */
  answerKeyComplete(record: WorkQuestionRecord): boolean;
  /** A code question without test cases can't be graded automatically (research W15). */
  lacksTestCases(record: WorkQuestionRecord): boolean;
  teacherFields(record: WorkQuestionRecord): TeacherQuestionTypeFields;
  /** Allowlist: copies only what a student may see (FR-033). */
  studentFields(record: WorkQuestionRecord): StudentQuestionTypeFields;
}

export const NO_TYPE_COLUMNS: WorkQuestionTypeColumns = {
  expectedAnswer: null,
  rubric: null,
  instructions: null,
  starterCode: null,
  expectedSolution: null,
  languageId: null,
  isTrickQuestion: false,
};

export function byPosition<T extends { position: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Present and not blank. */
export const filled = (text: string | null): text is string => text !== null && text.trim().length > 0;
