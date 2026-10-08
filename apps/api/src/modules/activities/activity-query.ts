import { type AiHelpAllowance, AiHelpAllowanceSchema, type GradeCents, gradeToCents } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import type { ActivityQuestionRow } from "./views/rows";

/** `numeric(5,2)` → hundredths: the only way a grade leaves the database here (011 research W3). */
export function decimalToCents(value: Prisma.Decimal): GradeCents {
  return gradeToCents(value.toFixed(2));
}

/** A nullable grade column (null for EXERCISE since 013 K1) in hundredths. */
export const nullableCents = (value: Prisma.Decimal | null): GradeCents | null => (value === null ? null : decimalToCents(value));

/** `smallint` → the platform's allowance: 0 or 3 by the CHECK (015 research F2), checked again here. */
export const aiHelpAllowanceOf = (value: number): AiHelpAllowance => AiHelpAllowanceSchema.parse(value);

/** A grade column that is NOT NULL for an ASSIGNMENT by the CHECK by type (013 K1). */
export function requiredCents(value: Prisma.Decimal | null): GradeCents {
  if (value === null) throw new Error("an ASSIGNMENT grade column is NOT NULL (CHECK)");
  return decimalToCents(value);
}

/** A snapshot question with everything the views read: answer key, test cases, language and topics. */
export const ACTIVITY_QUESTION_SELECT = {
  id: true,
  position: true,
  type: true,
  gradingStrategy: true,
  value: true,
  difficulty: true,
  points: true,
  statement: true,
  instructions: true,
  starterCode: true,
  language: { select: { id: true, name: true, highlight: true } },
  expectedAnswer: true,
  rubric: true,
  expectedSolution: true,
  explanation: true,
  isTrickQuestion: true,
  sourceExerciseId: true,
  alternatives: { orderBy: { position: "asc" }, select: { id: true, position: true, text: true, isCorrect: true } },
  testCases: { orderBy: { position: "asc" }, select: { position: true, input: true, expectedOutput: true, visibility: true } },
  topics: {
    orderBy: [{ syllabusItem: { group: { position: "asc" } } }, { syllabusItem: { position: "asc" } }],
    select: { syllabusItem: { select: { id: true, text: true } } },
  },
} as const satisfies Prisma.ClassActivityQuestionSelect;

type QuestionRow = Prisma.ClassActivityQuestionGetPayload<{ select: typeof ACTIVITY_QUESTION_SELECT }>;

/** The view row, plus the exercise it was copied from (the EXERCISE activity's source, in position order). */
export function toQuestionRow(row: QuestionRow): ActivityQuestionRow & { sourceExerciseId: string | null } {
  return {
    sourceExerciseId: row.sourceExerciseId,
    id: row.id,
    position: row.position,
    type: row.type,
    gradingStrategy: row.gradingStrategy,
    valueCents: nullableCents(row.value),
    difficulty: row.difficulty,
    points: row.points,
    statement: row.statement,
    instructions: row.instructions,
    starterCode: row.starterCode,
    language: row.language,
    expectedAnswer: row.expectedAnswer,
    rubric: row.rubric,
    expectedSolution: row.expectedSolution,
    explanation: row.explanation,
    isTrickQuestion: row.isTrickQuestion,
    alternatives: row.alternatives,
    testCases: row.testCases,
    topics: row.topics.map(({ syllabusItem }) => ({ syllabusItemId: syllabusItem.id, title: syllabusItem.text })),
  };
}

/** The activity header the teacher's views read. */
export const ACTIVITY_HEADER_SELECT = {
  id: true,
  classId: true,
  type: true,
  executionMode: true,
  aiHelpAllowance: true,
  status: true,
  title: true,
  instructions: true,
  totalGrade: true,
  questionCount: true,
  publishAt: true,
  deadline: true,
  latePolicy: true,
  sourceWorkId: true,
  outOfScopeTopicCount: true,
  resultReleasedAt: true,
  version: true,
  /** The EXERCISE's points, summed into `possiblePoints` (013/FR-003). */
  questions: { select: { points: true } },
} as const satisfies Prisma.ClassActivitySelect;

export type ActivityHeader = Prisma.ClassActivityGetPayload<{ select: typeof ACTIVITY_HEADER_SELECT }>;
