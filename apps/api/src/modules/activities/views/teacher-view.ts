import {
  centsToGrade,
  type RosterCounts,
  type RosterEntry,
  type TeacherActivity,
  type TeacherActivitySummary,
  type TeacherQuestion,
} from "@repo/contracts";
import { type ActivityHeader, decimalToCents } from "../activity-query";
import { ActivityStateMachine } from "../activity.state-machine";
import type { ActivityQuestionRow } from "./rows";

/** The full snapshot question, with the answer key: teacher routes only (research P15). */
export function toTeacherQuestion(row: ActivityQuestionRow): TeacherQuestion {
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    gradingStrategy: row.gradingStrategy,
    value: centsToGrade(row.valueCents),
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

/** One line of the class's activity list; the phase by the server clock (research P4). */
export function toTeacherActivitySummary(header: ActivityHeader, counts: RosterCounts, now: Date): TeacherActivitySummary {
  return {
    id: header.id,
    type: header.type,
    executionMode: header.executionMode,
    title: header.title,
    status: header.status,
    phase: ActivityStateMachine.phase(header.status, header.publishAt, now),
    publishAt: header.publishAt.toISOString(),
    deadline: header.deadline.toISOString(),
    latePolicy: header.latePolicy,
    totalGrade: centsToGrade(decimalToCents(header.totalGrade)),
    resultReleasedAt: header.resultReleasedAt?.toISOString() ?? null,
    counts,
  };
}

/**
 * The teacher's activity: the summary, the whole snapshot with the answer key in position order,
 * the source it was copied from (exercises in the chosen order) and the roster.
 */
export function toTeacherActivity(
  header: ActivityHeader,
  questions: readonly (ActivityQuestionRow & { sourceExerciseId: string | null })[],
  roster: { roster: RosterEntry[]; counts: RosterCounts },
  now: Date,
): TeacherActivity {
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  return {
    ...toTeacherActivitySummary(header, roster.counts, now),
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
