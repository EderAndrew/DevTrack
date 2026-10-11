import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, PauseInitiator, PauseReason, TeacherPause } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound } from "../../platform/http/errors";
import { pauseTime } from "../activities/status/pause-time";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { type StoredPause, toTeacherPause } from "./views";

interface PauseRow {
  id: string;
  attempt_id: string;
  initiated_by: PauseInitiator;
  reason: PauseReason;
  note: string | null;
  started_at: Date;
  released_at: Date | null;
  accepted_at: Date | null;
}

/**
 * The teacher's side of the room exits (016 US3, FR-014, research M7): releasing the return. The class
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
        SELECT p.id, p.attempt_id, p.initiated_by::text AS initiated_by, p.reason::text AS reason, p.note, p.started_at, p.released_at,
               s.submitted_at AS accepted_at
        FROM attempt_pauses p
        LEFT JOIN activity_submissions s ON s.attempt_id = p.attempt_id AND s.accepted_by_id IS NOT NULL
        WHERE p.id = ${pauseId}::uuid AND p.activity_id = ${activityId}::uuid
        FOR UPDATE OF p`;
      const row = pauses[0];
      if (!row) throw notFound();
      const stored = storedPause(row);
      const context = { acceptedAt: row.accepted_at, activityEndedAt: activity.ended_at };
      const now = this.clock.now();
      if (stored.releasedAt) return toTeacherPause(stored, context, now);
      if (activity.status !== "ACTIVE") throw new AppException("ACTIVITY_CLOSED");
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
}

const storedPause = (row: PauseRow): StoredPause => ({
  id: row.id,
  initiatedBy: row.initiated_by,
  reason: row.reason,
  note: row.note,
  startedAt: row.started_at,
  releasedAt: row.released_at,
});
