import {
  type ActivityAttendanceCounts,
  centsToGrade,
  type ExerciseRosterCounts,
  type RosterCounts,
  type RosterEntry,
  type TeacherActivity,
  type TeacherActivitySummary,
  type TeacherQuestion,
} from "@repo/contracts";
import { type ActivityHeader, aiHelpAllowanceOf, nullableCents } from "../activity-query";
import { ACTIVITY_TYPES } from "../activity-types";
import { ActivityStateMachine } from "../activity.state-machine";
import type { ActivityQuestionRow } from "./rows";

/** The full snapshot question, with the answer key: teacher routes only (research P15). */
export function toTeacherQuestion(row: ActivityQuestionRow): TeacherQuestion {
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    gradingStrategy: row.gradingStrategy,
    value: row.valueCents === null ? null : centsToGrade(row.valueCents),
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
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position),
    testCases: [...row.testCases].sort((a, b) => a.position - b.position),
    topics: row.topics,
  };
}

/** The sum of an EXERCISE's points (013/FR-003); null for an ASSIGNMENT, which has a grade instead. */
const possiblePointsOf = (header: ActivityHeader): number | null =>
  ACTIVITY_TYPES[header.type].scoring === "POINTS" ? header.questions.reduce((sum, question) => sum + (question.points ?? 0), 0) : null;

/**
 * One line of the class's activity list; the phase by the server clock (research P4). An EXERCISE
 * has no grade, deadline or late policy, only its possible points (013/FR-013).
 */
export function toTeacherActivitySummary(
  header: ActivityHeader,
  roster: { counts: RosterCounts; exerciseCounts: ExerciseRosterCounts | null },
  now: Date,
  attendance: ActivityAttendanceCounts | null,
): TeacherActivitySummary {
  const totalCents = nullableCents(header.totalGrade);
  return {
    id: header.id,
    type: header.type,
    executionMode: header.executionMode,
    aiHelp: { allowance: aiHelpAllowanceOf(header.aiHelpAllowance) },
    releaseMode: header.releaseMode,
    attendance,
    title: header.title,
    status: header.status,
    phase: ActivityStateMachine.phase(header.status, header.publishAt, now),
    publishAt: header.publishAt.toISOString(),
    deadline: header.deadline?.toISOString() ?? null,
    latePolicy: header.latePolicy,
    totalGrade: totalCents === null ? null : centsToGrade(totalCents),
    possiblePoints: possiblePointsOf(header),
    resultReleasedAt: header.resultReleasedAt?.toISOString() ?? null,
    counts: roster.counts,
    exerciseCounts: roster.exerciseCounts,
    // EXAM only (018 research T3, T4), from US2.
    exam: null,
  };
}

/**
 * The teacher's activity: the summary, the whole snapshot with the answer key in position order,
 * the source it was copied from (exercises in the chosen order) and the roster.
 */
export function toTeacherActivity(
  header: ActivityHeader,
  questions: readonly (ActivityQuestionRow & { sourceExerciseId: string | null })[],
  roster: { roster: RosterEntry[]; counts: RosterCounts; exerciseCounts: ExerciseRosterCounts | null },
  now: Date,
  attendance: ActivityAttendanceCounts | null,
): TeacherActivity {
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  return {
    ...toTeacherActivitySummary(header, roster, now, attendance),
    instructions: header.instructions,
    version: header.version,
    outOfScopeTopicCount: header.outOfScopeTopicCount,
    source:
      header.sourceWorkId !== null
        ? { workId: header.sourceWorkId }
        : { exerciseIds: ordered.flatMap((question) => (question.sourceExerciseId ? [question.sourceExerciseId] : [])) },
    questions: ordered.map(toTeacherQuestion),
    roster: roster.roster,
  };
}
