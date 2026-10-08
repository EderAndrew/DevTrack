import {
  type ActivityStatus,
  type ActivityType,
  type AttemptStatus,
  type ExerciseResult,
  centsToGrade,
  type EnrollmentStatus,
  type ExerciseRosterCounts,
  type LatePolicy,
  type RosterCounts,
  type RosterEntry,
} from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";
import { decimalToCents } from "./activity-query";
import { ACTIVITY_TYPES } from "./activity-types";
import { type ActivityFacts, assignmentSchedule } from "./status/facts";
import { deriveRosterStatus } from "./status/roster-status";

/** A student of the class as the roster reads it: ACTIVE, or REMOVED (kept when they have an attempt). */
export interface ClassStudent {
  studentUserId: string;
  name: string;
  enrollment: EnrollmentStatus;
}

export interface RosterAttempt {
  id: string;
  activityId: string;
  studentUserId: string;
  /** 1 for an ASSIGNMENT; the practice attempt's number for an EXERCISE (013 K3). */
  number: number;
  status: AttemptStatus;
  submission: { submittedAt: Date; late: boolean; gradeCents: number; gradePartial: boolean } | null;
  /** EXERCISE: the results of a concluded attempt (013 K6); empty otherwise. */
  results: { result: ExerciseResult; points: number }[];
  /** The AI helps delivered in this attempt (015/FR-020: only DELIVERED count). */
  helpUsed: number;
}

export interface RosterActivity {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  /** ASSIGNMENT only (013 K1). */
  deadline: Date | null;
  latePolicy: LatePolicy | null;
  released: boolean;
}

/** One student's facts in the activity, by type (contracts/student-status.md). */
function rosterFacts(activity: RosterActivity, attempts: readonly RosterAttempt[], classActive: boolean, now: Date): ActivityFacts {
  const latest = attempts.at(-1) ?? null;
  if (activity.type === "EXERCISE") {
    const first = attempts[0] ?? null;
    return {
      type: "EXERCISE",
      activityStatus: activity.status,
      classActive,
      latestAttempt: latest && { number: latest.number, status: latest.status },
      awaitingCorrection: first !== null && first.results.some((row) => row.result === "PENDING_TEACHER"),
      now,
    };
  }
  const submission = latest?.submission ?? null;
  return {
    type: "ASSIGNMENT",
    activityStatus: activity.status,
    ...assignmentSchedule(activity),
    classActive,
    attempt: latest && { status: latest.status },
    submission: submission && { late: submission.late, gradingComplete: !submission.gradePartial },
    released: activity.released,
    now,
  };
}

/**
 * Each student's situation in one activity (FR-006, contracts/student-status.md): the students with
 * an ACTIVE enrollment, plus the removed ones who started it (their work stays visible to the
 * teacher), by name. The status is derived with the server clock on every read. For an EXERCISE the
 * row points to attempt 1 — the one that scores and that the teacher marks — with its points and the
 * answers waiting for a mark (013/FR-016). A work's row counts the AI helps delivered ("2 de 3",
 * 015/FR-024).
 */
export function buildRoster(
  activity: RosterActivity,
  students: readonly ClassStudent[],
  attempts: readonly RosterAttempt[],
  classActive: boolean,
  now: Date,
): { roster: RosterEntry[]; counts: RosterCounts; exerciseCounts: ExerciseRosterCounts | null } {
  const byStudent = new Map<string, RosterAttempt[]>();
  for (const attempt of attempts.filter((a) => a.activityId === activity.id)) {
    byStudent.set(attempt.studentUserId, [...(byStudent.get(attempt.studentUserId) ?? []), attempt]);
  }
  for (const list of byStudent.values()) list.sort((a, b) => a.number - b.number);
  const exercise = activity.type === "EXERCISE";
  const workOptions = ACTIVITY_TYPES[activity.type].workOptions;
  const roster = students
    .filter((student) => student.enrollment === "ACTIVE" || byStudent.has(student.studentUserId))
    .map((student): RosterEntry => {
      const studentAttempts = byStudent.get(student.studentUserId) ?? [];
      const attempt = studentAttempts[0] ?? null;
      const submission = attempt?.submission ?? null;
      const results = attempt?.results ?? [];
      return {
        studentUserId: student.studentUserId,
        name: student.name,
        enrollment: student.enrollment,
        status: deriveRosterStatus(rosterFacts(activity, studentAttempts, classActive, now)),
        attemptId: attempt?.id ?? null,
        submittedAt: submission?.submittedAt.toISOString() ?? null,
        grade: submission ? centsToGrade(submission.gradeCents) : null,
        gradePartial: submission ? submission.gradePartial : null,
        pointsEarned: exercise ? results.reduce((sum, row) => sum + row.points, 0) : null,
        pendingMarks: exercise ? results.filter((row) => row.result === "PENDING_TEACHER").length : null,
        aiHelpUsed: workOptions ? (attempt?.helpUsed ?? 0) : null,
      };
    });
  const count = (status: RosterEntry["status"]) => roster.filter((entry) => entry.status === status).length;
  const active = roster.filter((entry) => entry.enrollment === "ACTIVE");
  return {
    roster,
    counts: {
      enrolled: students.filter((student) => student.enrollment === "ACTIVE").length,
      inProgress: count("IN_PROGRESS"),
      submitted: count("SUBMITTED"),
      submittedLate: count("SUBMITTED_LATE"),
      missed: count("MISSED"),
      pendingGrading: roster.filter((entry) => entry.gradePartial === true).length,
    },
    // "Concluíram: 12 de 30" counts the class's students; a mark waits whoever wrote the answer.
    exerciseCounts: exercise
      ? {
          completed: active.filter((entry) => entry.status === "COMPLETED").length,
          pendingMarks: roster.filter((entry) => (entry.pendingMarks ?? 0) > 0).length,
        }
      : null,
  };
}

/**
 * The class's students (one row each: ACTIVE wins over an older REMOVED enrollment) and the
 * attempts of these activities, in two queries whatever the number of activities.
 */
export async function loadRosterData(
  db: Tx,
  classId: string,
  activityIds: readonly string[],
): Promise<{ students: ClassStudent[]; attempts: RosterAttempt[] }> {
  const enrollments = await db.enrollment.findMany({
    where: { classId },
    select: { studentUserId: true, status: true, student: { select: { user: { select: { name: true } } } } },
  });
  const students = new Map<string, ClassStudent>();
  for (const row of enrollments) {
    const current = students.get(row.studentUserId);
    if (current?.enrollment === "ACTIVE") continue;
    students.set(row.studentUserId, { studentUserId: row.studentUserId, name: row.student.user.name, enrollment: row.status });
  }
  const attempts =
    activityIds.length === 0
      ? []
      : await db.activityAttempt.findMany({
          where: { activityId: { in: [...activityIds] } },
          select: {
            id: true,
            activityId: true,
            studentUserId: true,
            number: true,
            status: true,
            submission: { select: { submittedAt: true, late: true, grade: true, gradePartial: true } },
            results: { select: { result: true, points: true } },
            _count: { select: { helpRequests: { where: { status: "DELIVERED" } } } },
          },
        });
  return {
    students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.studentUserId.localeCompare(b.studentUserId)),
    attempts: attempts.map(({ _count, ...attempt }) => ({
      ...attempt,
      helpUsed: _count.helpRequests,
      submission: attempt.submission && {
        submittedAt: attempt.submission.submittedAt,
        late: attempt.submission.late,
        gradeCents: decimalToCents(attempt.submission.grade),
        gradePartial: attempt.submission.gradePartial,
      },
    })),
  };
}
