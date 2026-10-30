import { Inject, Injectable } from "@nestjs/common";
import type { ActivityStatus, GroupCandidates, GroupEditingRequest, GroupEventKind, LatePolicy, StudentActivity } from "@repo/contracts";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { GroupSettlement } from "../activities/group-settlement";
import { readGroup } from "../activities/group/settle-group";
import { assignmentSchedule } from "../activities/status/facts";
import { decideOperation } from "../activities/status/operations";
import { eligibleClassmates } from "./group-eligibility";
import { GroupRefused, recordGroupRefusal } from "./group-refusal";
import { MyActivitiesService } from "./my-activities.service";
import { releasedToSql, StudentActivityLoader } from "./student-activity-loader";

const CANDIDATES_ROUTE = "/me/activities/:activityId/group/candidates";
const EDITING_ROUTE = "/me/activities/:activityId/group/editing";
const MINUTE_SEC = 60;

/** Thrown inside the transaction when the activity is out of the student's context (→ 404 after the rollback). */
class OutOfContext extends Error {}

/** The caller is paused (016/FR-013): `409 ATTEMPT_PAUSED`, audited after the rollback. */
class CallerPaused extends Error {
  constructor(
    readonly attemptId: string,
    readonly pauseId: string,
  ) {
    super("ATTEMPT_PAUSED");
  }
}

/** The activity of the editing route, cancelled ones included: a cancellation ends the group (409), it doesn't hide it. */
interface EditingContext {
  status: ActivityStatus;
  deadline: Date | null;
  late_policy: LatePolicy | null;
  group_size: number | null;
  class_status: string;
  released: boolean;
}

/**
 * The student's side of a group work (023 contracts/http-api.md, "Student: group routes"): the
 * classmates the caller may choose (US2) and the editing (US4). Every read starts from the session
 * student's context, as the 012 routes do (`StudentActivityLoader`); the candidate list is a read, not
 * audited.
 */
@Injectable()
export class GroupWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: StudentActivityLoader,
    private readonly myActivities: MyActivitiesService,
    private readonly settlement: GroupSettlement,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * FR-004, FR-005: the eligible classmates by name and the slots the caller may still fill — `groupSize
   * − 1` before the start, `groupSize − participants` for the leader of a group. 404 out of context or on a
   * work that isn't in group; `409 GROUP_ALREADY_JOINED` for a student who started alone or is a member; the
   * 012 START rule's 409 (`ACTIVITY_CLOSED`, `DEADLINE_PASSED`…) when a start would be refused now.
   */
  async candidates(studentUserId: string, activityId: string, requestId: string | null): Promise<GroupCandidates> {
    const now = this.clock.now();
    const context = await this.loader.groupContext(studentUserId, activityId, now);
    if (!context) return this.denied(studentUserId, activityId, now, CANDIDATES_ROUTE, requestId);
    if (context.groupSize === null) throw notFound();
    let freeSlots = context.groupSize - 1;
    if (context.participation) {
      if (context.participation.leaderId !== studentUserId) throw new AppException("GROUP_ALREADY_JOINED");
      freeSlots = Math.max(0, context.groupSize - context.participation.participantCount);
    }
    // FR-005: no list on a work that no longer accepts a start (closed, deadline passed under REJECT…).
    if (context.startRefusal) throw new AppException(context.startRefusal);
    return { groupSize: context.groupSize, freeSlots, candidates: await eligibleClassmates(this.prisma, activityId, studentUserId) };
  }

  /**
   * FR-013 (research U7): "Passar a edição" (HAND, the leader, to an active member not paused), "Retomar a
   * edição" (TAKE_BACK, the leader) and "Devolver a edição" (RETURN, the member editing). After the group's
   * settlement, under the activity `FOR SHARE` and the attempt `FOR UPDATE`, so simultaneous requests apply
   * one after the other and end with one editor; each applied change bumps `version` (conditional UPDATE),
   * appends one `attempt_group_events` row and audits `activity_group.editing_changed`. A HAND to the
   * current editor changes nothing (200). While the attempt would refuse a save — submitted, closed, past a
   * REJECT deadline — or the work was cancelled: `409 INVALID_STATE_TRANSITION`. Counts in the 012 save
   * limit (research U18).
   */
  async changeEditing(studentUserId: string, activityId: string, body: GroupEditingRequest, requestId: string | null): Promise<StudentActivity> {
    const now = this.clock.now();
    await this.settlement.ofStudent(studentUserId, activityId, now, requestId);
    try {
      await this.prisma.runInTransaction((tx) => this.applyEditing(tx, studentUserId, activityId, body, now, requestId));
    } catch (error) {
      if (error instanceof OutOfContext) return this.denied(studentUserId, activityId, now, EDITING_ROUTE, requestId);
      if (error instanceof GroupRefused) throw await recordGroupRefusal(this.prisma, this.audit, studentUserId, error, requestId);
      if (error instanceof CallerPaused) {
        // Audited as the other writes refused while paused, here with operation GROUP_EDITING.
        await this.audit.record(this.prisma, {
          type: "attempt_pause.write_refused",
          actorType: "USER",
          actorUserId: studentUserId,
          targetType: "ACTIVITY_ATTEMPT",
          targetId: error.attemptId,
          requestId,
          metadata: { activityId, pauseId: error.pauseId, operation: "GROUP_EDITING" },
        });
        throw new AppException("ATTEMPT_PAUSED");
      }
      throw error;
    }
    return this.myActivities.get(studentUserId, activityId, requestId);
  }

  private async applyEditing(
    tx: Tx,
    studentUserId: string,
    activityId: string,
    body: GroupEditingRequest,
    now: Date,
    requestId: string | null,
  ): Promise<void> {
    const context = await lockEditingContext(tx, studentUserId, activityId, now);
    if (context.group_size === null) throw notFound();
    const attempt = await lockAttempt(tx, activityId, studentUserId);
    const group = attempt && (await readGroup(tx, attempt.id));
    if (!attempt || !group) throw notFound();
    const state = await this.rateLimit.hit("activity-saves", studentUserId, { limit: this.config.rateLimit.activitySavesPerMinute, windowSec: MINUTE_SEC }, tx);
    if (state.blocked) throw rateLimited(state.retryAfterSec);
    if (context.status === "CANCELLED" || !acceptsSave(context, attempt.status, now)) throw new AppException("INVALID_STATE_TRANSITION");
    // 016/FR-013, 023/FR-023: a paused caller doesn't move the editing.
    const pause = await tx.attemptPause.findFirst({ where: { attemptId: attempt.id, studentUserId, releasedAt: null }, select: { id: true } });
    if (pause) throw new CallerPaused(attempt.id, pause.id);

    const refuse = (reason: "NOT_EDITOR" | "NOT_LEADER") => new GroupRefused("EDITING", reason, activityId, attempt.id);
    const { roles } = group;
    const leads = roles.leaderId === studentUserId && group.leaderId === studentUserId;
    let to: string;
    let kind: GroupEventKind;
    if (body.action === "RETURN") {
      if (leads || roles.editorId !== studentUserId || group.editorId !== studentUserId) throw refuse("NOT_EDITOR");
      [to, kind] = [group.leaderId, "EDITING_RETURNED"];
    } else if (!leads) {
      throw refuse("NOT_LEADER");
    } else if (body.action === "TAKE_BACK") {
      [to, kind] = [studentUserId, "EDITING_TAKEN_BACK"];
    } else {
      const target = roles.members.find((member) => member.id === body.toUserId);
      if (!target?.active || target.paused) throw new AppException("GROUP_MEMBER_NOT_AVAILABLE");
      [to, kind] = [target.id, target.id === studentUserId ? "EDITING_TAKEN_BACK" : "EDITING_HANDED"];
    }
    const from = group.editorId;
    if (to === from) return; // Already editing: nothing changes, no row (idempotent).

    const updated = await tx.attemptGroup.updateMany({
      where: { attemptId: attempt.id, version: group.version },
      data: { editorUserId: to, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("the group changed under its attempt's lock");
    await tx.attemptGroupEvent.create({
      data: { attemptId: attempt.id, kind, reason: null, actorUserId: studentUserId, fromUserId: from, toUserId: to, occurredAt: now },
    });
    await this.audit.record(tx, {
      type: "activity_group.editing_changed",
      actorType: "USER",
      actorUserId: studentUserId,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempt.id,
      requestId,
      metadata: { activityId, attemptId: attempt.id, kind, reason: null, fromUserId: from, toUserId: to },
    });
  }

  /** 404, auditing `student_access.denied` when the activity exists (012 research P18). */
  private async denied(studentUserId: string, activityId: string, now: Date, route: string, requestId: string | null): Promise<never> {
    const reason = await this.loader.deniedReason(studentUserId, activityId, now);
    if (reason) {
      await this.audit.record(this.prisma, {
        type: "student_access.denied",
        actorType: "USER",
        actorUserId: studentUserId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { route, reason },
      });
    }
    throw notFound();
  }
}

/**
 * The group work in the student's context — published, of a class where they are ACTIVE, released to them
 * (016) — under `FOR SHARE` (a close waits); cancelled included, unlike the 012 `lockContext`. Else `OutOfContext`.
 */
async function lockEditingContext(tx: Tx, studentUserId: string, activityId: string, now: Date): Promise<EditingContext> {
  const rows = await tx.$queryRaw<EditingContext[]>`
    SELECT ca.status::text AS status, ca.deadline, ca.late_policy::text AS late_policy, ca.group_size,
           c.status::text AS class_status, (ca.result_released_at IS NOT NULL) AS released
    FROM class_activities ca
    JOIN classes c ON c.id = ca.class_id
    WHERE ca.id = ${activityId}::uuid
      AND ca.type = 'ASSIGNMENT'
      AND ca.publish_at <= ${now}
      AND EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ca.class_id AND e.student_user_id = ${studentUserId}::uuid AND e.status = 'ACTIVE')
      AND ${releasedToSql(studentUserId)}
    FOR SHARE OF ca`;
  const context = rows[0];
  if (!context) throw new OutOfContext();
  return context;
}

/** The attempt the student takes part in (023 research U5), `FOR UPDATE`: the group's serialization point. */
async function lockAttempt(tx: Tx, activityId: string, studentUserId: string): Promise<{ id: string; status: "IN_PROGRESS" | "SUBMITTED" } | null> {
  const rows = await tx.$queryRaw<{ id: string; status: "IN_PROGRESS" | "SUBMITTED" }[]>`
    SELECT a.id, a.status::text AS status
    FROM activity_attempts a
    JOIN attempt_participants p ON p.attempt_id = a.id
    WHERE a.activity_id = ${activityId}::uuid AND p.student_user_id = ${studentUserId}::uuid
    ORDER BY a.number DESC LIMIT 1
    FOR UPDATE OF a`;
  return rows[0] ?? null;
}

/** Whether the 012 SAVE rule would accept a write now: the editing moves only while answers can change. */
function acceptsSave(context: EditingContext, attemptStatus: "IN_PROGRESS" | "SUBMITTED", now: Date): boolean {
  const outcome = decideOperation("SAVE", {
    type: "ASSIGNMENT",
    activityStatus: context.status,
    ...assignmentSchedule({ deadline: context.deadline, latePolicy: context.late_policy }),
    classActive: context.class_status === "ACTIVE",
    attempt: { status: attemptStatus },
    submission: attemptStatus === "SUBMITTED" ? { late: false, gradingComplete: false } : null,
    released: context.released,
    now,
  });
  return outcome.kind === "ALLOWED";
}
