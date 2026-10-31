import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, AttemptPauses, PauseInitiator, PauseReason, ReleaseMode, TeacherPause } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound } from "../../platform/http/errors";
import { examEndOf, pauseTime } from "../activities/status/pause-time";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { type StoredPause, toTeacherPause } from "./views";

const PAUSE_SELECT = { id: true, studentUserId: true, initiatedBy: true, reason: true, note: true, startedAt: true, releasedAt: true } as const;

interface PauseRow {
  id: string;
  attempt_id: string;
  student_user_id: string;
  initiated_by: PauseInitiator;
  reason: PauseReason;
  note: string | null;
  started_at: Date;
  released_at: Date | null;
  accepted_at: Date | null;
  exam_ends_at: Date | null;
}

/**
 * The teacher's side of the room exits (016 US3, US4, US5, FR-014, FR-016, FR-021, research M7):
 * pausing a student, releasing the return and reading an attempt's pauses in the review. The class
 * goes through `ClassContextPolicy`, the activity is looked up by `(id, class_id)` and the pause by
 * `(id, activity_id)`, so another teacher's ids are a plain 404. The route is keyed by the pause and
 * idempotent: a released pause comes back unchanged, so a double click never ends a later one. A pause
 * already ended by derivation is never written: the activity's close or cancellation → `409
 * ACTIVITY_CLOSED`; the teacher's acceptance of the submission → returned as it is.
 */
@Injectable()
export class PausesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * "Pausar aluno" (016/US5, FR-016): the same pause as the student's declared exit, in the same
   * transaction shape — the activity `FOR SHARE` (a close waits) and the target student's latest
   * attempt `FOR UPDATE`, so it is ordered with every write of that attempt — with `initiatedBy:
   * TEACHER` and the reason `TEACHER`. A student who is not an ACTIVE student of the class → 404. An
   * open pause (the student's or the teacher's) comes back as it is, `created: false` (→ 200).
   */
  async pauseStudent(
    teacherId: string,
    classId: string,
    activityId: string,
    studentUserId: string,
    requestId: string | null,
  ): Promise<{ pause: TeacherPause; created: boolean }> {
    return this.prisma.runInTransaction(async (tx) => {
      await this.classes.findOwnedOrNotFound(teacherId, classId, tx);
      const activities = await tx.$queryRaw<{ release_mode: ReleaseMode; status: ActivityStatus; class_active: boolean; duration_minutes: number | null }[]>`
        SELECT ca.release_mode::text AS release_mode, ca.status::text AS status, (c.status = 'ACTIVE') AS class_active, ca.duration_minutes
        FROM class_activities ca JOIN classes c ON c.id = ca.class_id
        WHERE ca.id = ${activityId}::uuid AND ca.class_id = ${classId}::uuid
        FOR SHARE OF ca`;
      const activity = activities[0];
      if (!activity) throw notFound();
      const enrolled = await tx.$queryRaw<{ student_user_id: string }[]>`
        SELECT student_user_id FROM enrollments
        WHERE class_id = ${classId}::uuid AND student_user_id = ${studentUserId}::uuid AND status = 'ACTIVE'`;
      if (!enrolled[0]) throw notFound();
      if (activity.release_mode !== "PRESENT_ONLY") throw new AppException("ATTENDANCE_NOT_REQUIRED");
      const attempts = await tx.$queryRaw<{ id: string; status: "IN_PROGRESS" | "SUBMITTED"; started_at: Date }[]>`
        SELECT a.id, a.status::text AS status, a.started_at FROM activity_attempts a
        JOIN attempt_participants pt ON pt.attempt_id = a.id
        WHERE a.activity_id = ${activityId}::uuid AND pt.student_user_id = ${studentUserId}::uuid
        ORDER BY a.number DESC LIMIT 1
        FOR UPDATE OF a`;
      const attempt = attempts[0];
      if (!attempt) throw new AppException("NOT_STARTED");
      if (attempt.status === "SUBMITTED") throw new AppException("ATTEMPT_ALREADY_SUBMITTED");
      if (activity.status !== "ACTIVE" || !activity.class_active) throw new AppException("ACTIVITY_CLOSED");

      const now = this.clock.now();
      // 018/FR-026, research T8, T11: an exam on hold waits for the teacher's decision, and one whose
      // time is over is no longer answered (settled on its next touch), so neither takes a pause.
      // A separate statement after the attempt's lock: it sees a hold opened while this one waited.
      const holds = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM exam_attempt_holds WHERE attempt_id = ${attempt.id}::uuid AND resolution IS NULL`;
      if (holds[0]) throw new AppException("EXAM_ATTEMPT_ON_HOLD");
      const examEndsAt = examEndOf(attempt.started_at, activity.duration_minutes);
      if (examEndsAt && now >= examEndsAt) throw new AppException("EXAM_TIME_OVER");
      // An IN_PROGRESS attempt of an ACTIVE activity within its time: a pause with no release is open.
      const context = { acceptedAt: null, activityEndedAt: null, examEndsAt };
      // 023/FR-023: the student's own open pause; a group member may have theirs at the same time.
      const open = await tx.attemptPause.findFirst({ where: { attemptId: attempt.id, studentUserId, releasedAt: null }, select: PAUSE_SELECT });
      if (open) return { pause: toTeacherPause(open, context, now), created: false };

      const pause: StoredPause = await tx.attemptPause.create({
        data: {
          attemptId: attempt.id,
          activityId,
          studentUserId,
          initiatedBy: "TEACHER",
          reason: "TEACHER",
          note: null,
          startedAt: now,
          startedById: teacherId,
        },
        select: PAUSE_SELECT,
      });
      await this.audit.record(tx, {
        type: "attempt_pause.started",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: attempt.id,
        requestId,
        metadata: { activityId, pauseId: pause.id, initiatedBy: "TEACHER", reason: "TEACHER" },
      });
      return { pause: toTeacherPause(pause, context, now), created: true };
    });
  }

  /**
   * Under the activity's `FOR SHARE` (a close waits, so a release never lands after it) and the
   * pause's `FOR UPDATE` (two releases end it once). `attempt_pause.released` with the seconds away.
   */
  async release(teacherId: string, classId: string, activityId: string, pauseId: string, requestId: string | null): Promise<TeacherPause> {
    return this.prisma.runInTransaction(async (tx) => {
      await this.classes.findOwnedOrNotFound(teacherId, classId, tx);
      const activities = await tx.$queryRaw<{ status: ActivityStatus; ended_at: Date | null }[]>`
        SELECT status::text AS status, COALESCE(closed_at, cancelled_at) AS ended_at FROM class_activities
        WHERE id = ${activityId}::uuid AND class_id = ${classId}::uuid
        FOR SHARE`;
      const activity = activities[0];
      if (!activity) throw notFound();
      const pauses = await tx.$queryRaw<PauseRow[]>`
        SELECT p.id, p.attempt_id, p.student_user_id, p.initiated_by::text AS initiated_by, p.reason::text AS reason, p.note, p.started_at, p.released_at,
               s.submitted_at AS accepted_at, a.started_at + make_interval(mins => ca.duration_minutes) AS exam_ends_at
        FROM attempt_pauses p
        JOIN activity_attempts a ON a.id = p.attempt_id
        JOIN class_activities ca ON ca.id = p.activity_id
        LEFT JOIN activity_submissions s ON s.attempt_id = p.attempt_id AND s.accepted_by_id IS NOT NULL
        WHERE p.id = ${pauseId}::uuid AND p.activity_id = ${activityId}::uuid
        FOR UPDATE OF p`;
      const row = pauses[0];
      if (!row) throw notFound();
      const stored = storedPause(row);
      const context = { acceptedAt: row.accepted_at, activityEndedAt: activity.ended_at, examEndsAt: row.exam_ends_at };
      const now = this.clock.now();
      if (stored.releasedAt) return toTeacherPause(stored, context, now);
      if (activity.status !== "ACTIVE") throw new AppException("ACTIVITY_CLOSED");
      // 018/FR-027: the time kept running; once it is over the attempt ended by time, never resumed.
      if (row.exam_ends_at && now >= row.exam_ends_at) throw new AppException("EXAM_TIME_OVER");
      if (pauseTime(stored, context, now).endedBy !== null) return toTeacherPause(stored, context, now);

      await tx.attemptPause.update({ where: { id: pauseId }, data: { releasedAt: now, releasedById: teacherId } });
      const released = toTeacherPause({ ...stored, releasedAt: now }, context, now);
      await this.audit.record(tx, {
        type: "attempt_pause.released",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: row.attempt_id,
        requestId,
        metadata: { activityId, pauseId, seconds: released.seconds },
      });
      return released;
    });
  }

  /**
   * An attempt's pauses, oldest first, each with its end and duration derived with the server's now,
   * and their sum (016/FR-021). The attempt is looked up by `(id, activity_id)` inside the teacher's
   * class, so any other id is a 404. A read: nothing is written or audited.
   */
  async forAttempt(teacherId: string, classId: string, activityId: string, attemptId: string): Promise<AttemptPauses> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const attempt = await this.prisma.activityAttempt.findFirst({
      where: { id: attemptId, activityId, activity: { classId } },
      select: {
        startedAt: true,
        activity: { select: { closedAt: true, cancelledAt: true, durationMinutes: true } },
        submission: { select: { submittedAt: true, acceptedById: true } },
        pauses: {
          orderBy: [{ startedAt: "asc" }, { id: "asc" }],
          select: PAUSE_SELECT,
        },
      },
    });
    if (!attempt) throw notFound();
    const context = {
      acceptedAt: attempt.submission?.acceptedById ? attempt.submission.submittedAt : null,
      activityEndedAt: attempt.activity.closedAt ?? attempt.activity.cancelledAt,
      examEndsAt: examEndOf(attempt.startedAt, attempt.activity.durationMinutes),
    };
    const now = this.clock.now();
    const items = attempt.pauses.map((pause) => toTeacherPause(pause, context, now));
    return { items, totalSecondsAway: items.reduce((sum, pause) => sum + pause.seconds, 0) };
  }
}

const storedPause = (row: PauseRow): StoredPause => ({
  id: row.id,
  studentUserId: row.student_user_id,
  initiatedBy: row.initiated_by,
  reason: row.reason,
  note: row.note,
  startedAt: row.started_at,
  releasedAt: row.released_at,
});
