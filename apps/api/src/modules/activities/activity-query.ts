import { type ActivityAttendanceCounts, type AiHelpAllowance, AiHelpAllowanceSchema, type ExecutionKey, type GradeCents, gradeToCents } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";
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
  language: { select: { id: true, name: true, highlight: true, execution: true } },
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
    // `execution` is CHECKed to the contract's profile keys (019 research B5).
    language: row.language && { ...row.language, execution: row.language.execution as ExecutionKey | null },
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
  releaseMode: true,
  status: true,
  title: true,
  instructions: true,
  totalGrade: true,
  questionCount: true,
  publishAt: true,
  deadline: true,
  latePolicy: true,
  sourceWorkId: true,
  /** 018: the exam it was copied from and its time (EXAM only, CHECK). */
  sourceExamId: true,
  durationMinutes: true,
  inactivityLimitSeconds: true,
  startWindowMinutes: true,
  outOfScopeTopicCount: true,
  resultReleasedAt: true,
  /** 016: where an open pause ends by derivation (research M7). */
  closedAt: true,
  cancelledAt: true,
  version: true,
  /** The EXERCISE's points, summed into `possiblePoints` (013/FR-003). */
  questions: { select: { points: true } },
} as const satisfies Prisma.ClassActivitySelect;

export type ActivityHeader = Prisma.ClassActivityGetPayload<{ select: typeof ACTIVITY_HEADER_SELECT }>;

/**
 * The presences of each activity among the class's ACTIVE students (016 research M9), in one
 * aggregate query whatever the number of activities: "Aguardando chamada" while 0, then "n de m
 * presentes". Read straight from the table: `activities` never imports `attendance` (research M1).
 */
export async function loadPresentCounts(db: Tx, activityIds: readonly string[]): Promise<Map<string, number>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ activity_id: string; present: number }[]>`
    SELECT aa.activity_id, count(*)::int AS present
    FROM activity_attendances aa
    JOIN enrollments e ON e.class_id = aa.class_id AND e.student_user_id = aa.student_user_id AND e.status = 'ACTIVE'
    WHERE aa.activity_id = ANY(${[...activityIds]}::uuid[])
    GROUP BY aa.activity_id`;
  return new Map(rows.map((row) => [row.activity_id, row.present]));
}

/**
 * The holds waiting for the teacher's decision in each EXAM (018 research T10), in one aggregate query.
 * Read straight from the table: `activities` never imports `exam-sessions` (research T1).
 */
export async function loadPendingDecisions(db: Tx, activityIds: readonly string[]): Promise<Map<string, number>> {
  if (activityIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ activity_id: string; pending: number }[]>`
    SELECT activity_id, count(*)::int AS pending FROM exam_attempt_holds
    WHERE activity_id = ANY(${[...activityIds]}::uuid[]) AND resolution IS NULL
    GROUP BY activity_id`;
  return new Map(rows.map((row) => [row.activity_id, row.pending]));
}

/** The counts of a `PRESENT_ONLY` work; null for `ALL_ENROLLED`, which takes no attendance. */
export const attendanceOf = (header: Pick<ActivityHeader, "id" | "releaseMode">, present: ReadonlyMap<string, number>, enrolled: number): ActivityAttendanceCounts | null =>
  header.releaseMode === "PRESENT_ONLY" ? { present: present.get(header.id) ?? 0, enrolled } : null;
