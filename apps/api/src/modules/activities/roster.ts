import {
  type ActivityStatus,
  type AttemptStatus,
  centsToGrade,
  type EnrollmentStatus,
  type LatePolicy,
  type RosterCounts,
  type RosterEntry,
} from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";
import { decimalToCents } from "./activity-query";
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
  status: AttemptStatus;
  submission: { submittedAt: Date; late: boolean; gradeCents: number; gradePartial: boolean } | null;
}

export interface RosterActivity {
  id: string;
  status: ActivityStatus;
  deadline: Date;
  latePolicy: LatePolicy;
  released: boolean;
}

/**
 * Each student's situation in one activity (FR-006, contracts/student-status.md): the students with
 * an ACTIVE enrollment, plus the removed ones who started it (their work stays visible to the
 * teacher), by name. The status is derived with the server clock on every read.
 */
export function buildRoster(
  activity: RosterActivity,
  students: readonly ClassStudent[],
  attempts: readonly RosterAttempt[],
  classActive: boolean,
  now: Date,
): { roster: RosterEntry[]; counts: RosterCounts } {
  const byStudent = new Map(attempts.filter((a) => a.activityId === activity.id).map((a) => [a.studentUserId, a]));
  const roster = students
    .filter((student) => student.enrollment === "ACTIVE" || byStudent.has(student.studentUserId))
    .map((student): RosterEntry => {
      const attempt = byStudent.get(student.studentUserId) ?? null;
      const submission = attempt?.submission ?? null;
      return {
        studentUserId: student.studentUserId,
        name: student.name,
        enrollment: student.enrollment,
        status: deriveRosterStatus({
          activityStatus: activity.status,
          deadline: activity.deadline,
          latePolicy: activity.latePolicy,
          classActive,
          attempt: attempt && { status: attempt.status },
          submission: submission && { late: submission.late, gradingComplete: !submission.gradePartial },
          released: activity.released,
          now,
        }),
        attemptId: attempt?.id ?? null,
        submittedAt: submission?.submittedAt.toISOString() ?? null,
        grade: submission ? centsToGrade(submission.gradeCents) : null,
        gradePartial: submission ? submission.gradePartial : null,
      };
    });
  const count = (status: RosterEntry["status"]) => roster.filter((entry) => entry.status === status).length;
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
            status: true,
            submission: { select: { submittedAt: true, late: true, grade: true, gradePartial: true } },
          },
        });
  return {
    students: [...students.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.studentUserId.localeCompare(b.studentUserId)),
    attempts: attempts.map((attempt) => ({
      ...attempt,
      submission: attempt.submission && {
        submittedAt: attempt.submission.submittedAt,
        late: attempt.submission.late,
        gradeCents: decimalToCents(attempt.submission.grade),
        gradePartial: attempt.submission.gradePartial,
      },
    })),
  };
}
