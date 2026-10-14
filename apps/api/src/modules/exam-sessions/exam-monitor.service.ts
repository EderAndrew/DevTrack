import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, ExamEndReason, ExamMonitor, ExamMonitorStudent, ExamStatusOfStudent, PauseInitiator, PauseReason } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound } from "../../platform/http/errors";
import { ExamSettlement } from "../activities/exam-settlement";
import { closesAt, endsAt, type ExamTiming, startDeadline } from "../activities/status/exam-time";
import { examTiming } from "../activities/status/facts";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { examStatusOf } from "./exam-status";
import { openPauseOf, toTeacherExamHold } from "./views";

/** An EXAM activity of the teacher's class, as the monitor and the decisions read it. */
export interface ExamActivityRow {
  type: string;
  status: ActivityStatus;
  publish_at: Date;
  duration_minutes: number | null;
  start_window_minutes: number | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
}

export const timingOf = (row: ExamActivityRow): ExamTiming =>
  examTiming({
    publishAt: row.publish_at,
    durationMinutes: row.duration_minutes,
    startWindowMinutes: row.start_window_minutes,
    closedAt: row.closed_at,
    cancelledAt: row.cancelled_at,
  });

interface MonitorRow {
  student_user_id: string;
  name: string;
  marked_at: Date | null;
  attempt_id: string | null;
  attempt_status: "IN_PROGRESS" | "SUBMITTED" | null;
  started_at: Date | null;
  end_reason: ExamEndReason | null;
  occurrence_count: number;
  hold_id: string | null;
  hold_ordinal: number | null;
  hold_opened_at: Date | null;
  pause_id: string | null;
  pause_initiated_by: PauseInitiator | null;
  pause_reason: PauseReason | null;
  pause_note: string | null;
  pause_started_at: Date | null;
}

/** Students on hold first, then paused (contracts/http-api.md), then by name. */
const RANK: Partial<Record<ExamStatusOfStudent, number>> = { AWAITING_DECISION: 0, PAUSED: 1 };
const rank = (status: ExamStatusOfStudent) => RANK[status] ?? 2;

/**
 * The teacher's exam monitor (018/FR-025, research T12), polled every 5 s: per ACTIVE student of the
 * class the presence, the situation, the attempt's end, the occurrence count, the open hold and the
 * open pause, every one derived with the server's clock. The expired attempts are settled first
 * (research T5). The attendance, pause, occurrence and hold tables are read in one query of its own,
 * never through `attendance` (016 research M1). A read: nothing is audited.
 */
@Injectable()
export class ExamMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassContextPolicy,
    private readonly examSettlement: ExamSettlement,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async monitor(teacherId: string, classId: string, activityId: string): Promise<ExamMonitor> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.examSettlement.ofActivity(classId, activityId, this.clock.now(), null);
    const activity = await findExamActivity(this.prisma, classId, activityId);
    const timing = timingOf(activity);
    const deadline = startDeadline(timing);
    const now = this.clock.now();
    const rows = await this.prisma.$queryRaw<MonitorRow[]>`
      SELECT e.student_user_id, u.name, aa.marked_at,
             a.id AS attempt_id, a.status::text AS attempt_status, a.started_at,
             s.end_reason::text AS end_reason,
             COALESCE((SELECT max(o.ordinal) FROM exam_occurrences o WHERE o.attempt_id = a.id), 0)::int AS occurrence_count,
             h.id AS hold_id, h.occurrence_ordinal AS hold_ordinal, h.opened_at AS hold_opened_at,
             p.id AS pause_id, p.initiated_by::text AS pause_initiated_by, p.reason::text AS pause_reason,
             p.note AS pause_note, p.started_at AS pause_started_at
      FROM enrollments e
      JOIN users u ON u.id = e.student_user_id
      LEFT JOIN activity_attendances aa ON aa.activity_id = ${activityId}::uuid AND aa.student_user_id = e.student_user_id
      LEFT JOIN LATERAL (
        SELECT at.id, at.status, at.started_at FROM activity_attempts at
        WHERE at.activity_id = ${activityId}::uuid AND at.student_user_id = e.student_user_id
        ORDER BY at.number DESC LIMIT 1
      ) a ON true
      LEFT JOIN activity_submissions s ON s.attempt_id = a.id
      LEFT JOIN exam_attempt_holds h ON h.attempt_id = a.id AND h.resolution IS NULL
      LEFT JOIN attempt_pauses p ON p.attempt_id = a.id AND p.released_at IS NULL
      WHERE e.class_id = ${classId}::uuid AND e.status = 'ACTIVE'`;

    const activityEndedAt = activity.closed_at ?? activity.cancelled_at;
    const students = rows
      .map((row): ExamMonitorStudent => {
        const end = row.started_at ? endsAt(timing, row.started_at) : null;
        const inProgress = row.attempt_status === "IN_PROGRESS";
        const openHold =
          row.hold_id && row.hold_ordinal !== null && row.hold_opened_at && row.attempt_id && end
            ? toTeacherExamHold(
                { id: row.hold_id, attemptId: row.attempt_id, occurrenceOrdinal: row.hold_ordinal, openedAt: row.hold_opened_at, resolution: null, resolvedAt: null },
                end,
                activity.status,
                now,
              )
            : null;
        const unreleased =
          inProgress && row.pause_id && row.pause_initiated_by && row.pause_reason && row.pause_started_at
            ? { id: row.pause_id, initiatedBy: row.pause_initiated_by, reason: row.pause_reason, note: row.pause_note, startedAt: row.pause_started_at }
            : null;
        const openPause = openPauseOf(unreleased, { acceptedAt: null, activityEndedAt, examEndsAt: end }, now);
        return {
          studentUserId: row.student_user_id,
          name: row.name,
          markedAt: row.marked_at?.toISOString() ?? null,
          examStatus: examStatusOf(
            { markedAt: row.marked_at, startedAt: row.started_at, endReason: row.end_reason, holdOpen: openHold !== null, pauseOpen: openPause !== null },
            deadline,
            now,
          ),
          attemptId: row.attempt_id,
          startedAt: row.started_at?.toISOString() ?? null,
          endsAt: end?.toISOString() ?? null,
          occurrenceCount: row.occurrence_count,
          openHold,
          openPause,
        };
      })
      .sort((a, b) => rank(a.examStatus) - rank(b.examStatus) || a.name.localeCompare(b.name, "pt-BR") || a.studentUserId.localeCompare(b.studentUserId));

    return {
      activityId,
      durationMinutes: timing.durationMinutes,
      startDeadline: deadline.toISOString(),
      closesAt: closesAt(timing).toISOString(),
      serverNow: now.toISOString(),
      students,
    };
  }
}

/**
 * The activity by `(id, class_id)` (another class's id → 404), refused with `409 NOT_AN_EXAM` when it
 * isn't an EXAM. `lock` takes it `FOR SHARE` for a decision (research T9): a close, a cancellation or
 * a release waits for it.
 */
export async function findExamActivity(db: Tx, classId: string, activityId: string, lock = false): Promise<ExamActivityRow> {
  const rows = lock
    ? await db.$queryRaw<ExamActivityRow[]>`
        SELECT type::text AS type, status::text AS status, publish_at, duration_minutes, start_window_minutes, closed_at, cancelled_at
        FROM class_activities WHERE id = ${activityId}::uuid AND class_id = ${classId}::uuid
        FOR SHARE`
    : await db.$queryRaw<ExamActivityRow[]>`
        SELECT type::text AS type, status::text AS status, publish_at, duration_minutes, start_window_minutes, closed_at, cancelled_at
        FROM class_activities WHERE id = ${activityId}::uuid AND class_id = ${classId}::uuid`;
  const activity = rows[0];
  if (!activity) throw notFound();
  if (activity.type !== "EXAM") throw new AppException("NOT_AN_EXAM");
  return activity;
}
