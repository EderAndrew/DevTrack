import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, StudentExamNudge, TeacherExamNudge } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound } from "../../platform/http/errors";
import { MobileWriteLimit } from "../../platform/http/mobile-write-limit";
import { ExamSettlement } from "../activities/exam-settlement";
import { endsAt } from "../activities/status/exam-time";
import { examTiming } from "../activities/status/facts";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { StudentActivityLoader } from "../student-activities/student-activity-loader";
import { MIN_OCCURRENCES_FOR_NUDGE, type NudgeAttemptFacts, nudgeShown, running } from "./nudge-status";
import { type StoredExamNudge, toStudentExamNudge, toTeacherExamNudge } from "./views";

/** Why a send was refused (contracts/audit-events.md `exam_nudge.send_refused`). */
export type NudgeRefusal = "NOT_IN_PROGRESS" | "ON_HOLD" | "PAUSED" | "TOO_FEW_OCCURRENCES";

interface ExamRow {
  status: ActivityStatus;
  publish_at: Date;
  duration_minutes: number | null;
  start_window_minutes: number | null;
  closed_at: Date | null;
  cancelled_at: Date | null;
}

interface AttemptFactsRow {
  status: "IN_PROGRESS" | "SUBMITTED";
  started_at: Date;
  submitted_at: Date | null;
  hold_open: boolean;
  pause_started_at: Date | null;
  occurrence_count: number;
}

interface NudgeRow {
  id: string;
  sent_at: Date;
  dismissed_at: Date | null;
}

/** Why a dismissal was refused (contracts/http-api.md): the 018 codes for the same states (FR-014). */
type DismissRefusal = "ATTEMPT_PAUSED" | "EXAM_ATTEMPT_ON_HOLD" | "EXAM_NUDGE_NOT_PENDING";

/** The route patterns `student_access.denied` names (never the URL with its ids). */
const PENDING_ROUTE = "/me/activities/:activityId/attempt/exam-nudge";
const DISMISS_ROUTE = "/me/activities/:activityId/attempt/exam-nudge/:nudgeId/dismiss";

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

type SendOutcome = { kind: "sent"; nudge: TeacherExamNudge; created: boolean } | { kind: "refused"; reason: NudgeRefusal };

/** A trigger of `exam_nudges` refused the row (data-model.md): the same 409 as the service's own check. */
const isNudgeTriggerError = (error: unknown) => error instanceof Error && /exam_nudges: /.test(error.message);

/**
 * The teacher's discreet warning from the app's bell (025/US1, research N5). The send runs the 018 settlement
 * first (an expired attempt ends there and the send is refused), then, under the attempt's `FOR UPDATE` — the
 * lock of the 018 events batch, saves and decisions — re-derives the eligibility with the pure `nudge-status.ts`
 * and inserts with `ON CONFLICT DO NOTHING` on the one-pending index; a pending warning is returned as it is
 * (`created: false`, no event). A refusal is `409 EXAM_NUDGE_NOT_ALLOWED` with `exam_nudge.send_refused` in its
 * own transaction; another class, not an EXAM or another activity's attempt is the same 404, with no event. It
 * only reads the exam's tables and writes only `exam_nudges` (exam-nudges-boundary.spec.ts).
 */
@Injectable()
export class ExamNudgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    private readonly examSettlement: ExamSettlement,
    private readonly limit: MobileWriteLimit,
    private readonly loader: StudentActivityLoader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async send(
    teacherId: string,
    classId: string,
    activityId: string,
    attemptId: string,
    requestId: string | null,
  ): Promise<{ nudge: TeacherExamNudge; created: boolean }> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    // The app's writes per minute (024 `mobile-writes`), counted even when the send is refused.
    await this.prisma.runInTransaction((tx) => this.limit.assert(tx, teacherId));
    await this.examSettlement.ofActivity(classId, activityId, this.clock.now(), requestId);

    let outcome: SendOutcome;
    try {
      outcome = await this.prisma.runInTransaction((tx) => this.sendWithin(tx, teacherId, classId, activityId, attemptId, requestId));
    } catch (error) {
      if (isNudgeTriggerError(error)) throw new AppException("EXAM_NUDGE_NOT_ALLOWED");
      throw error;
    }
    if (outcome.kind === "sent") return { nudge: outcome.nudge, created: outcome.created };

    const reason = outcome.reason;
    await this.prisma.runInTransaction((tx) =>
      this.audit.record(tx, {
        type: "exam_nudge.send_refused",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: attemptId,
        requestId,
        metadata: { activityId, reason },
      }),
    );
    throw new AppException("EXAM_NUDGE_NOT_ALLOWED");
  }

  /**
   * The student's poll on the exam page (025/US2, research N7): the pending warning of the own attempt only while
   * it is shown (`nudgeShown`: running, not paused, not held), else `null`; a read, nothing written. The access is
   * the 018 student routes': ACTIVE enrollment and the 016 presence (out → 404 and `student_access.denied`), an
   * activity that is not an EXAM or no own attempt → 404.
   */
  async studentPending(studentId: string, activityId: string, requestId: string | null): Promise<StudentExamNudge> {
    const now = this.clock.now();
    await this.examSettlement.ofAttempt(studentId, activityId, now, requestId);
    const context = await this.loader.ownAttempt(studentId, activityId, now);
    if (!context) return this.denied(studentId, activityId, now, PENDING_ROUTE, requestId);
    if (context.type !== "EXAM" || !context.attempt) throw notFound();
    const attemptId = context.attempt.id;
    const pending = await this.prisma.$queryRaw<NudgeRow[]>`
      SELECT id, sent_at, dismissed_at FROM exam_nudges WHERE attempt_id = ${attemptId}::uuid AND dismissed_at IS NULL`;
    const nudge = pending[0];
    if (!nudge) return { nudge: null };
    const facts = await loadFacts(this.prisma, activityId, attemptId);
    if (!nudgeShown(stored(nudge), facts, now)) return { nudge: null };
    const users = await this.prisma.$queryRaw<{ name: string }[]>`SELECT name FROM users WHERE id = ${studentId}::uuid`;
    return { nudge: toStudentExamNudge(stored(nudge), users[0]!.name) };
  }

  /**
   * "Entendi" (025/US2, research N7): under the own attempt's `FOR UPDATE`, `dismissed_at` from the server's
   * clock once (`UPDATE … WHERE dismissed_at IS NULL`) with `exam_nudge.dismissed` in the same transaction; an
   * already dismissed warning is `200` with no event. Paused → `409 ATTEMPT_PAUSED`, held → `409
   * EXAM_ATTEMPT_ON_HOLD`, ended → `409 EXAM_NUDGE_NOT_PENDING`; a warning of another attempt → `404`.
   */
  async dismiss(studentId: string, activityId: string, nudgeId: string, requestId: string | null): Promise<StudentExamNudge> {
    const now = this.clock.now();
    await this.examSettlement.ofAttempt(studentId, activityId, now, requestId);
    try {
      await this.prisma.runInTransaction(async (tx) => {
        const context = await this.loader.ownAttempt(studentId, activityId, now, tx, "UPDATE");
        if (!context) throw new OutOfContext();
        if (context.type !== "EXAM" || !context.attempt) throw notFound();
        const attemptId = context.attempt.id;
        const rows = await tx.$queryRaw<NudgeRow[]>`
          SELECT id, sent_at, dismissed_at FROM exam_nudges WHERE id = ${nudgeId}::uuid AND attempt_id = ${attemptId}::uuid
          FOR UPDATE`;
        const nudge = rows[0];
        if (!nudge) throw notFound();
        if (nudge.dismissed_at !== null) return;
        const refusal = dismissRefusalOf(await loadFacts(tx, activityId, attemptId), now);
        if (refusal) throw new AppException(refusal);
        const updated = await tx.$queryRaw<{ id: string }[]>`
          UPDATE exam_nudges SET dismissed_at = ${now}
          WHERE id = ${nudgeId}::uuid AND dismissed_at IS NULL
          RETURNING id`;
        if (!updated[0]) return;
        await this.audit.record(tx, {
          type: "exam_nudge.dismissed",
          actorType: "USER",
          actorUserId: studentId,
          targetType: "ACTIVITY_ATTEMPT",
          targetId: attemptId,
          requestId,
          metadata: { activityId, nudgeId },
        });
      });
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentId, activityId, now, DISMISS_ROUTE, requestId);
      throw error;
    }
    return { nudge: null };
  }

  /** 404, auditing `student_access.denied` when the activity exists (012 research P18), as the 018 student routes. */
  private async denied(userId: string, activityId: string, now: Date, route: string, requestId: string | null): Promise<never> {
    const reason = await this.loader.deniedReason(userId, activityId, now);
    if (reason) {
      await this.audit.record(this.prisma, {
        type: "student_access.denied",
        actorType: "USER",
        actorUserId: userId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { route, reason },
      });
    }
    throw notFound();
  }

  private async sendWithin(tx: Tx, teacherId: string, classId: string, activityId: string, attemptId: string, requestId: string | null): Promise<SendOutcome> {
    const exams = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM class_activities
      WHERE id = ${activityId}::uuid AND class_id = ${classId}::uuid AND type = 'EXAM'
      FOR SHARE`;
    if (!exams[0]) throw notFound();
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM activity_attempts WHERE id = ${attemptId}::uuid AND activity_id = ${activityId}::uuid
      FOR UPDATE`;
    if (!locked[0]) throw notFound();

    const facts = await loadFacts(tx, activityId, attemptId);
    const now = this.clock.now();

    const refusal = refusalOf(facts, now);
    if (refusal) return { kind: "refused", reason: refusal };
    const pending = await tx.$queryRaw<NudgeRow[]>`
      SELECT id, sent_at, dismissed_at FROM exam_nudges WHERE attempt_id = ${attemptId}::uuid AND dismissed_at IS NULL`;
    if (pending[0]) return { kind: "sent", nudge: toTeacherExamNudge(stored(pending[0]), facts, now), created: false };
    if (facts.occurrenceCount < MIN_OCCURRENCES_FOR_NUDGE) return { kind: "refused", reason: "TOO_FEW_OCCURRENCES" };

    const inserted = await tx.$queryRaw<NudgeRow[]>`
      INSERT INTO exam_nudges (attempt_id, activity_id, sent_by_user_id, sent_at)
      VALUES (${attemptId}::uuid, ${activityId}::uuid, ${teacherId}::uuid, ${now})
      ON CONFLICT (attempt_id) WHERE dismissed_at IS NULL DO NOTHING
      RETURNING id, sent_at, dismissed_at`;
    const nudge = inserted[0];
    if (!nudge) {
      const existing = await tx.$queryRaw<NudgeRow[]>`
        SELECT id, sent_at, dismissed_at FROM exam_nudges WHERE attempt_id = ${attemptId}::uuid AND dismissed_at IS NULL`;
      return { kind: "sent", nudge: toTeacherExamNudge(stored(existing[0]!), facts, now), created: false };
    }
    await this.audit.record(tx, {
      type: "exam_nudge.sent",
      actorType: "USER",
      actorUserId: teacherId,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attemptId,
      requestId,
      metadata: { activityId, nudgeId: nudge.id, occurrenceCount: facts.occurrenceCount },
    });
    return { kind: "sent", nudge: toTeacherExamNudge(stored(nudge), facts, now), created: true };
  }
}

/** The first reason the attempt is not running, in the audit's order (contracts/audit-events.md). */
function refusalOf(facts: NudgeAttemptFacts, now: Date): NudgeRefusal | null {
  if (running(facts, now)) return null;
  if (facts.holdOpen) return "ON_HOLD";
  if (running({ ...facts, openPause: null }, now)) return "PAUSED";
  return "NOT_IN_PROGRESS";
}

/** The first reason a dismissal is refused, or null while the attempt runs (contracts/http-api.md). */
function dismissRefusalOf(facts: NudgeAttemptFacts, now: Date): DismissRefusal | null {
  if (running(facts, now)) return null;
  if (!running({ ...facts, holdOpen: false, openPause: null }, now)) return "EXAM_NUDGE_NOT_PENDING";
  return facts.holdOpen ? "EXAM_ATTEMPT_ON_HOLD" : "ATTEMPT_PAUSED";
}

/** What the derivations read of an exam attempt (research N6): status, submission, hold, pause, end, occurrences. */
async function loadFacts(db: Tx | PrismaService, activityId: string, attemptId: string): Promise<NudgeAttemptFacts> {
  const exams = await db.$queryRaw<ExamRow[]>`
    SELECT status::text AS status, publish_at, duration_minutes, start_window_minutes, closed_at, cancelled_at
    FROM class_activities WHERE id = ${activityId}::uuid`;
  const exam = exams[0]!;
  const rows = await db.$queryRaw<AttemptFactsRow[]>`
    SELECT a.status::text AS status, a.started_at, s.submitted_at,
           EXISTS (SELECT 1 FROM exam_attempt_holds h WHERE h.attempt_id = a.id AND h.resolution IS NULL) AS hold_open,
           (SELECT p.started_at FROM attempt_pauses p WHERE p.attempt_id = a.id AND p.released_at IS NULL
            ORDER BY p.started_at DESC LIMIT 1) AS pause_started_at,
           COALESCE((SELECT max(o.ordinal) FROM exam_occurrences o WHERE o.attempt_id = a.id), 0)::int AS occurrence_count
    FROM activity_attempts a
    LEFT JOIN activity_submissions s ON s.attempt_id = a.id
    WHERE a.id = ${attemptId}::uuid`;
  const row = rows[0]!;
  const timing = examTiming({
    publishAt: exam.publish_at,
    durationMinutes: exam.duration_minutes,
    startWindowMinutes: exam.start_window_minutes,
    closedAt: exam.closed_at,
    cancelledAt: exam.cancelled_at,
  });
  return {
    attemptStatus: row.status,
    submittedAt: row.submitted_at,
    holdOpen: row.hold_open,
    openPause: row.pause_started_at ? { startedAt: row.pause_started_at, releasedAt: null } : null,
    endsAt: endsAt(timing, row.started_at),
    activityStatus: exam.status,
    activityEndedAt: exam.closed_at ?? exam.cancelled_at,
    occurrenceCount: row.occurrence_count,
  };
}

const stored = (row: NudgeRow): StoredExamNudge => ({ id: row.id, sentAt: row.sent_at, dismissedAt: row.dismissed_at });
