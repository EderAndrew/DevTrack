import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, AttemptStatus, AttendanceBatch, PauseInitiator, PauseReason, ReleaseMode, Room } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { type RoomRow, toRoomStudent } from "./views";

interface ActivityRow {
  release_mode: ReleaseMode;
  status: ActivityStatus;
  class_active: boolean;
}

interface RoomQueryRow {
  student_user_id: string;
  name: string;
  marked_at: Date | null;
  attempt_id: string | null;
  attempt_status: AttemptStatus | null;
  accepted_at: Date | null;
  activity_ended_at: Date | null;
  pause_id: string | null;
  pause_initiated_by: PauseInitiator | null;
  pause_reason: PauseReason | null;
  pause_note: string | null;
  pause_started_at: Date | null;
}

const byName = (a: { name: string; studentUserId: string }, b: { name: string; studentUserId: string }) =>
  a.name.localeCompare(b.name, "pt-BR") || a.studentUserId.localeCompare(b.studentUserId);

/**
 * The teacher's attendance of a work (016 US1, US2, research M3, M5, M8): the room of the class's
 * ACTIVE students and the batch that marks (releases the work to) and unmarks them. The class goes
 * through `ClassContextPolicy` and the activity is looked up by `(id, class_id)`, so another teacher's
 * class or activity is a plain 404. Only a `PRESENT_ONLY` work takes attendance (`409
 * ATTENDANCE_NOT_REQUIRED`). Times come from the injected server clock.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly classes: ClassContextPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The "Chamada" tab: one query for the activity, one for every student's facts (FR-003, FR-020). */
  async room(teacherId: string, classId: string, activityId: string): Promise<Room> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const activity = await findActivity(this.prisma, classId, activityId, false);
    if (activity.release_mode !== "PRESENT_ONLY") throw new AppException("ATTENDANCE_NOT_REQUIRED");
    return readRoom(this.prisma, classId, activityId, this.clock.now());
  }

  /**
   * One batch, all or nothing (research M5), under the activity's `FOR SHARE` (a close waits for it):
   * every id an ACTIVE student of the class (`422 STUDENT_NOT_IN_CLASS`); the presences to unmark
   * `FOR UPDATE`, so a start waits, and any of them with an attempt → `409 ATTENDANCE_STARTED` naming
   * them; then the deletes and the inserts (`ON CONFLICT DO NOTHING`, the first `marked_at` stays). One
   * `attendance.marked` / `attendance.unmarked` per student actually changed; no-ops write nothing.
   */
  async apply(teacherId: string, classId: string, activityId: string, batch: AttendanceBatch, requestId: string | null): Promise<Room> {
    return this.prisma.runInTransaction(async (tx) => {
      await this.classes.findOwnedOrNotFound(teacherId, classId, tx);
      const activity = await findActivity(tx, classId, activityId, true);
      if (activity.release_mode !== "PRESENT_ONLY") throw new AppException("ATTENDANCE_NOT_REQUIRED");
      if (activity.status !== "ACTIVE") throw new AppException("ACTIVITY_CLOSED");
      if (!activity.class_active) throw new AppException("CLASS_NOT_ACTIVE");

      const ids = [...new Set([...batch.mark, ...batch.unmark])];
      const enrolled = await tx.$queryRaw<{ student_user_id: string }[]>`
        SELECT e.student_user_id FROM enrollments e
        WHERE e.class_id = ${classId}::uuid AND e.status = 'ACTIVE' AND e.student_user_id = ANY(${ids}::uuid[])`;
      if (new Set(enrolled.map((row) => row.student_user_id)).size !== ids.length) throw new AppException("STUDENT_NOT_IN_CLASS");

      const now = this.clock.now();
      const changed: { type: "attendance.marked" | "attendance.unmarked"; studentUserId: string }[] = [];
      if (batch.unmark.length > 0) {
        await tx.$queryRaw`
          SELECT 1 FROM activity_attendances
          WHERE activity_id = ${activityId}::uuid AND student_user_id = ANY(${batch.unmark}::uuid[])
          ORDER BY student_user_id
          FOR UPDATE`;
        const started = await tx.$queryRaw<{ student_user_id: string }[]>`
          SELECT DISTINCT student_user_id FROM activity_attempts
          WHERE activity_id = ${activityId}::uuid AND student_user_id = ANY(${batch.unmark}::uuid[])
          ORDER BY student_user_id`;
        if (started.length > 0) {
          throw new AppException("ATTENDANCE_STARTED", undefined, {}, { studentUserIds: started.map((row) => row.student_user_id) });
        }
        const removed = await tx.$queryRaw<{ student_user_id: string }[]>`
          DELETE FROM activity_attendances
          WHERE activity_id = ${activityId}::uuid AND student_user_id = ANY(${batch.unmark}::uuid[])
          RETURNING student_user_id`;
        changed.push(...removed.map((row) => ({ type: "attendance.unmarked" as const, studentUserId: row.student_user_id })));
      }
      if (batch.mark.length > 0) {
        const inserted = await tx.$queryRaw<{ student_user_id: string }[]>`
          INSERT INTO activity_attendances (activity_id, student_user_id, class_id, marked_at, marked_by_id)
          SELECT ${activityId}::uuid, id, ${classId}::uuid, ${now}, ${teacherId}::uuid
          FROM unnest(${batch.mark}::uuid[]) AS id
          ORDER BY id
          ON CONFLICT DO NOTHING
          RETURNING student_user_id`;
        changed.push(...inserted.map((row) => ({ type: "attendance.marked" as const, studentUserId: row.student_user_id })));
      }
      for (const { type, studentUserId } of changed.sort((a, b) => a.studentUserId.localeCompare(b.studentUserId))) {
        await this.audit.record(tx, {
          type,
          actorType: "USER",
          actorUserId: teacherId,
          targetType: "CLASS_ACTIVITY",
          targetId: activityId,
          requestId,
          metadata: { classId, studentUserId },
        });
      }
      return readRoom(tx, classId, activityId, now);
    });
  }
}

/** The activity of the class, `FOR SHARE` inside a write; another class's or a missing one → 404. */
async function findActivity(db: Tx, classId: string, activityId: string, lock: boolean): Promise<ActivityRow> {
  const rows = lock
    ? await db.$queryRaw<ActivityRow[]>`
        SELECT ca.release_mode::text AS release_mode, ca.status::text AS status, (c.status = 'ACTIVE') AS class_active
        FROM class_activities ca JOIN classes c ON c.id = ca.class_id
        WHERE ca.id = ${activityId}::uuid AND ca.class_id = ${classId}::uuid
        FOR SHARE OF ca`
    : await db.$queryRaw<ActivityRow[]>`
        SELECT ca.release_mode::text AS release_mode, ca.status::text AS status, (c.status = 'ACTIVE') AS class_active
        FROM class_activities ca JOIN classes c ON c.id = ca.class_id
        WHERE ca.id = ${activityId}::uuid AND ca.class_id = ${classId}::uuid`;
  const activity = rows[0];
  if (!activity) throw notFound();
  return activity;
}

/**
 * Every ACTIVE student of the class with their presence, latest attempt and pause without a release,
 * in one query whatever the class size (research M8); the situation in the room is derived here.
 */
async function readRoom(db: Tx, classId: string, activityId: string, now: Date): Promise<Room> {
  const rows = await db.$queryRaw<RoomQueryRow[]>`
    SELECT e.student_user_id, u.name, aa.marked_at,
           a.id AS attempt_id, a.status::text AS attempt_status,
           s.submitted_at AS accepted_at, COALESCE(ca.closed_at, ca.cancelled_at) AS activity_ended_at,
           p.id AS pause_id, p.initiated_by::text AS pause_initiated_by, p.reason::text AS pause_reason,
           p.note AS pause_note, p.started_at AS pause_started_at
    FROM enrollments e
    JOIN users u ON u.id = e.student_user_id
    JOIN class_activities ca ON ca.id = ${activityId}::uuid
    LEFT JOIN activity_attendances aa ON aa.activity_id = ca.id AND aa.student_user_id = e.student_user_id
    LEFT JOIN LATERAL (
      SELECT at.id, at.status FROM activity_attempts at
      WHERE at.activity_id = ca.id AND at.student_user_id = e.student_user_id
      ORDER BY at.number DESC LIMIT 1
    ) a ON true
    LEFT JOIN activity_submissions s ON s.attempt_id = a.id AND s.accepted_by_id IS NOT NULL
    LEFT JOIN attempt_pauses p ON p.attempt_id = a.id AND p.released_at IS NULL
    WHERE e.class_id = ${classId}::uuid AND e.status = 'ACTIVE'`;
  const students = rows
    .map(
      (row): RoomRow => ({
        studentUserId: row.student_user_id,
        name: row.name,
        markedAt: row.marked_at,
        attempt: row.attempt_id && row.attempt_status ? { id: row.attempt_id, status: row.attempt_status } : null,
        unreleasedPause:
          row.pause_id && row.pause_initiated_by && row.pause_reason && row.pause_started_at
            ? {
                id: row.pause_id,
                initiatedBy: row.pause_initiated_by,
                reason: row.pause_reason,
                note: row.pause_note,
                startedAt: row.pause_started_at,
                releasedAt: null,
              }
            : null,
        pauseEnd: { acceptedAt: row.accepted_at, activityEndedAt: row.activity_ended_at },
      }),
    )
    .sort(byName)
    .map((row) => toRoomStudent(row, now));
  return {
    releaseMode: "PRESENT_ONLY",
    present: students.filter((student) => student.markedAt !== null).length,
    enrolled: students.length,
    students,
  };
}
