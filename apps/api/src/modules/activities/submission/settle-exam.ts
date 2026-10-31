import type { ExamEndReason } from "@repo/contracts";
import { Prisma } from "../../../generated/prisma/client";
import type { Tx } from "../../../platform/database/transaction";
import type { AuditService } from "../../audit/audit.service";
import { EXAM_END_GRACE_MS, acceptsWrite, endedByActivity, endsAt } from "../status/exam-time";
import { examTiming } from "../status/facts";
import { registerSubmission } from "./register-submission";

export interface SettleExamInput {
  activityId: string;
  /** The teacher's touches: only when the activity is of this class (their own, already checked). */
  classId?: string;
  /** Only this student's attempt; every expired attempt of the activity when absent. */
  studentUserId?: string;
  /** Server clock. */
  now: Date;
  requestId?: string | null;
}

interface TimingRow {
  publish_at: Date;
  duration_minutes: number | null;
  start_window_minutes: number | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
}

/**
 * The time-out settlement (018 research T5): every IN_PROGRESS attempt of an EXAM whose end plus the
 * grace has passed, and that has no open hold, becomes its submission — dated at the computed end,
 * `TIME_EXPIRED` (or `ACTIVITY_CLOSED` when the teacher's close or cancellation came first), never
 * late, graded on the saved answers with the blanks at zero — and one `exam_attempt.time_expired`
 * (SYSTEM). Under the activity `FOR SHARE` and the attempts `FOR UPDATE`, in the caller's transaction:
 * a second run, or a student's submit that got the lock first, finds the attempt SUBMITTED and does
 * nothing. Not an EXAM → nothing. Returns how many attempts it settled.
 */
export async function settleExpiredExamAttempts(tx: Tx, audit: AuditService, input: SettleExamInput): Promise<number> {
  const { activityId, now } = input;
  const ofClass = input.classId ? Prisma.sql`AND class_id = ${input.classId}::uuid` : Prisma.empty;
  const activities = await tx.$queryRaw<TimingRow[]>`
    SELECT publish_at, duration_minutes, start_window_minutes, closed_at, cancelled_at
    FROM class_activities WHERE id = ${activityId}::uuid AND type = 'EXAM' ${ofClass}
    FOR SHARE`;
  const row = activities[0];
  if (!row) return 0;
  const timing = examTiming({
    publishAt: row.publish_at,
    durationMinutes: row.duration_minutes,
    startWindowMinutes: row.start_window_minutes,
    closedAt: row.closed_at,
    cancelledAt: row.cancelled_at,
  });

  // Only the candidates are locked: an attempt still within its time is left alone (the student's
  // saves keep their own lock). `exam-time.ts` decides each one again below.
  const cutoff = new Date(now.getTime() - EXAM_END_GRACE_MS);
  const activityEnded = [timing.closedAt, timing.cancelledAt].some((date) => date !== null && date <= cutoff);
  const startedBy = new Date(cutoff.getTime() - timing.durationMinutes * 60_000);
  const student = input.studentUserId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM attempt_participants pt WHERE pt.attempt_id = a.id AND pt.student_user_id = ${input.studentUserId}::uuid)`
    : Prisma.empty;
  const candidates = await tx.$queryRaw<{ id: string; student_user_id: string; started_at: Date }[]>`
    SELECT a.id, a.student_user_id, a.started_at
    FROM activity_attempts a
    WHERE a.activity_id = ${activityId}::uuid AND a.status = 'IN_PROGRESS' ${student}
      AND (${activityEnded} OR a.started_at <= ${startedBy})
      AND NOT EXISTS (SELECT 1 FROM exam_attempt_holds h WHERE h.attempt_id = a.id AND h.resolution IS NULL)
    ORDER BY a.id
    FOR UPDATE OF a`;

  let settled = 0;
  for (const attempt of candidates) {
    const end = endsAt(timing, attempt.started_at);
    if (acceptsWrite(now, end)) continue;
    // A separate statement after the lock: a hold committed while this one waited is seen.
    const held = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM exam_attempt_holds WHERE attempt_id = ${attempt.id}::uuid AND resolution IS NULL`;
    if (held.length > 0) continue;
    const endReason: ExamEndReason = endedByActivity(timing, attempt.started_at) ? "ACTIVITY_CLOSED" : "TIME_EXPIRED";
    const submission = await registerSubmission(tx, {
      attemptId: attempt.id,
      activityId,
      submittedByUserId: null,
      now: end,
      late: false,
      endReason,
    });
    await audit.record(tx, {
      type: "exam_attempt.time_expired",
      actorType: "SYSTEM",
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempt.id,
      requestId: input.requestId ?? null,
      metadata: { activityId, submissionId: submission.submissionId, endReason, blankCount: submission.blankCount },
    });
    settled += 1;
  }
  return settled;
}

/**
 * Settles the session student's expired exam attempts in every activity they have one in (the
 * student's list and dashboard, research T5): one query finds them, then each activity is settled.
 */
export async function settleStudentExams(tx: Tx, audit: AuditService, input: { studentUserId: string; now: Date; requestId?: string | null }): Promise<number> {
  const activities = await tx.$queryRaw<{ activity_id: string }[]>`
    SELECT DISTINCT a.activity_id
    FROM activity_attempts a
    JOIN attempt_participants pt ON pt.attempt_id = a.id
    JOIN class_activities ca ON ca.id = a.activity_id
    WHERE pt.student_user_id = ${input.studentUserId}::uuid AND a.status = 'IN_PROGRESS' AND ca.type = 'EXAM'
    ORDER BY a.activity_id`;
  let settled = 0;
  for (const { activity_id } of activities) settled += await settleExpiredExamAttempts(tx, audit, { ...input, activityId: activity_id });
  return settled;
}

/** The same for every EXAM of a class with an attempt in progress (the teacher's list of activities). */
export async function settleClassExams(tx: Tx, audit: AuditService, input: { classId: string; now: Date; requestId?: string | null }): Promise<number> {
  const activities = await tx.$queryRaw<{ id: string }[]>`
    SELECT ca.id FROM class_activities ca
    WHERE ca.class_id = ${input.classId}::uuid AND ca.type = 'EXAM'
      AND EXISTS (SELECT 1 FROM activity_attempts a WHERE a.activity_id = ca.id AND a.status = 'IN_PROGRESS')
    ORDER BY ca.id`;
  let settled = 0;
  for (const { id } of activities) settled += await settleExpiredExamAttempts(tx, audit, { ...input, activityId: id });
  return settled;
}
