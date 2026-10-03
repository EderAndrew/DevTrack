import { Inject, Injectable } from "@nestjs/common";
import {
  type ActivitySource,
  type ActivityStatus,
  type ActivityType,
  type CreateActivityRequest,
  type LatePolicy,
  type ScopeCheck,
  type TeacherActivity,
  type TeacherActivitySummary,
  type UpdateActivityRequest,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound, rateLimited, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { ACTIVITY_HEADER_SELECT, ACTIVITY_QUESTION_SELECT, type ActivityHeader, toQuestionRow } from "./activity-query";
import { ActivityStateMachine } from "./activity.state-machine";
import { buildRoster, loadRosterData } from "./roster";
import { scopeCheckOf } from "./scope/load-taught-scope";
import { readSource, type SourceContent, toSnapshot } from "./snapshot/read-source";
import { writeSnapshot } from "./snapshot/write-snapshot";
import { toTeacherActivity, toTeacherActivitySummary } from "./views/teacher-view";

const HOUR_SEC = 3_600;

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** The fields a PATCH may change, in the order `activity.updated` lists them. */
type EditableField = "deadline" | "instructions" | "latePolicy" | "publishAt" | "title";

interface LockedActivity {
  type: ActivityType;
  status: ActivityStatus;
  version: number;
  publishAt: Date;
  /** ASSIGNMENT only (013 K1). */
  deadline: Date | null;
  resultReleasedAt: Date | null;
}

/**
 * The teacher's side of class activities (012 US1, research P1–P6): applying an APPROVED work or
 * 1–10 APPROVED exercises of the session teacher's bank to their class as a snapshot, the taught
 * scope flagged and confirmed, then editing, closing and cancelling it. The class goes through
 * `ClassContextPolicy` and the activity is looked up by `(id, class_id)`, so another teacher's class
 * or activity is a plain 404. "Now" is the injected server clock (constitution III); grades are
 * integer hundredths, `numeric(5,2)` only at the database boundary.
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly classes: ClassContextPolicy,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Every activity of the class, all statuses, by deadline (latest first), with the roster counts. */
  async list(teacherId: string, classId: string): Promise<{ items: TeacherActivitySummary[] }> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId);
    const headers = await this.prisma.classActivity.findMany({
      where: { classId },
      select: ACTIVITY_HEADER_SELECT,
      // An EXERCISE has no deadline (013 K1): it comes first, newest publication first.
      orderBy: [{ deadline: { sort: "desc", nulls: "first" } }, { publishAt: "desc" }, { id: "desc" }],
    });
    const { students, attempts } = await loadRosterData(this.prisma, classId, headers.map((header) => header.id));
    const now = this.clock.now();
    return {
      items: headers.map((header) =>
        toTeacherActivitySummary(header, buildRoster(rosterActivity(header), students, attempts, schoolClass.status === "ACTIVE", now).counts, now),
      ),
    };
  }

  async get(teacherId: string, classId: string, activityId: string, db: Tx = this.prisma): Promise<TeacherActivity> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId, db);
    const header = await db.classActivity.findFirst({ where: { id: activityId, classId }, select: ACTIVITY_HEADER_SELECT });
    if (!header) throw notFound();
    const questions = await db.classActivityQuestion.findMany({ where: { activityId }, select: ACTIVITY_QUESTION_SELECT });
    const { students, attempts } = await loadRosterData(db, classId, [activityId]);
    const now = this.clock.now();
    const roster = buildRoster(rosterActivity(header), students, attempts, schoolClass.status === "ACTIVE", now);
    return toTeacherActivity(header, questions.map(toQuestionRow), roster, now);
  }

  /**
   * The topics of the source outside the class's taught scope (FR-005a, research P5), before the
   * teacher confirms; the creation computes it again in its own transaction.
   */
  async scopeCheck(teacherId: string, classId: string, source: ActivitySource): Promise<ScopeCheck> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId);
    return this.prisma.runInTransaction(async (tx) => {
      const content = await readSource(tx, teacherId, source);
      assertSameSubject(schoolClass.subjectId, content);
      return scopeCheckOf(tx, classId, toSnapshot(content).questions);
    });
  }

  /**
   * Applies the source to the class (FR-001, FR-002, FR-005, FR-005a), in the order of
   * contracts/http-api.md: the class (404), the same idempotency key (the activity it created,
   * `created: false`), the class ACTIVE (409), the schedule by the server clock (422), the hourly
   * limit (429), then in one transaction the source (404, 422), the subject (422), the taught
   * scope (422 unless acknowledged), the snapshot and `activity.published`.
   */
  async create(
    auth: AuthContext,
    classId: string,
    body: CreateActivityRequest,
    requestId: string | null,
  ): Promise<{ view: TeacherActivity; created: boolean }> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    const replay = await this.replay(teacherId, classId, body.idempotencyKey);
    if (replay) return replay;

    const now = this.clock.now();
    const publishAt = body.publishAt ? new Date(body.publishAt) : now;
    // An ASSIGNMENT has a deadline after the publication; an EXERCISE has neither deadline nor late policy (013/FR-001).
    const schedule: { deadline: Date; latePolicy: LatePolicy } | null =
      "deadline" in body ? { deadline: new Date(body.deadline), latePolicy: body.latePolicy } : null;
    if (schedule && schedule.deadline.getTime() <= publishAt.getTime()) throw new AppException("INVALID_SCHEDULE");
    await this.assertWriteRate(teacherId);

    let activityId: string;
    try {
      activityId = await this.prisma.runInTransaction(async (tx) => {
        const schoolClass = await lockClass(tx, teacherId, classId);
        if (schoolClass.status !== "ACTIVE") throw new AppException("CLASS_NOT_ACTIVE");
        const content = await readSource(tx, teacherId, body.source);
        assertSameSubject(schoolClass.subjectId, content);
        const snapshot = toSnapshot(content);
        const scope = await scopeCheckOf(tx, classId, snapshot.questions);
        if (scope.outOfScope.length > 0 && !body.acknowledgeOutOfScope) throw new AppException("OUT_OF_SCOPE_NOT_ACKNOWLEDGED");

        const id = await writeSnapshot(
          tx,
          {
            classId,
            teacherId,
            type: content.type,
            title: body.title,
            instructions: body.instructions ?? null,
            publishAt,
            deadline: schedule?.deadline ?? null,
            latePolicy: schedule?.latePolicy ?? null,
            sourceWorkId: content.type === "ASSIGNMENT" ? content.workId : null,
            sourceSubjectId: content.type === "ASSIGNMENT" ? content.subjectId : null,
            outOfScopeTopicCount: scope.outOfScope.length,
            idempotencyKey: body.idempotencyKey,
          },
          snapshot,
        );
        await this.audit.record(tx, {
          type: "activity.published",
          actorType: "USER",
          actorUserId: teacherId,
          targetType: "CLASS_ACTIVITY",
          targetId: id,
          requestId,
          metadata: {
            classId,
            type: content.type,
            executionMode: "NORMAL",
            ...(content.type === "ASSIGNMENT" ? { sourceWorkId: content.workId } : { sourceExerciseCount: content.exerciseIds.length }),
            questionCount: snapshot.questions.length,
            // A grade and a late policy (ASSIGNMENT) or the possible points (EXERCISE, 013 K15).
            ...(snapshot.totalCents !== null && schedule
              ? { totalCents: snapshot.totalCents, latePolicy: schedule.latePolicy }
              : { possiblePoints: snapshot.questions.reduce((sum, question) => sum + (question.points ?? 0), 0) }),
            scheduled: publishAt.getTime() > now.getTime(),
            outOfScopeTopicCount: scope.outOfScope.length,
            hasPlan: scope.hasPlan,
          },
        });
        return id;
      });
    } catch (error) {
      // A concurrent request with the same key won (double click): answer its activity.
      if (isUniqueViolation(error)) {
        const winner = await this.replay(teacherId, classId, body.idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
    return { view: await this.get(teacherId, classId, activityId), created: true };
  }

  /**
   * Title, instructions, deadline and late policy of an ACTIVE activity, at the version the teacher
   * read (FR-004, FR-024a); the publication date only while it is still scheduled (`422
   * ALREADY_PUBLISHED`); the deadline stays after the publication (`422 INVALID_SCHEDULE`). An
   * EXERCISE has no deadline or late policy: either in the body → 400 (013/FR-004).
   * Nothing changed → the activity as it is, no event and no new version.
   */
  async update(
    auth: AuthContext,
    classId: string,
    activityId: string,
    body: UpdateActivityRequest,
    requestId: string | null,
  ): Promise<TeacherActivity> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const current = await lockActivity(tx, classId, activityId);
      if (current.deadline === null && (body.deadline !== undefined || body.latePolicy !== undefined)) throw validationError();
      if (current.version !== body.version) throw new AppException("ACTIVITY_VERSION_CONFLICT");
      ActivityStateMachine.assertEditable(current.status);

      const stored = await tx.classActivity.findUniqueOrThrow({
        where: { id: activityId },
        select: { title: true, instructions: true, latePolicy: true },
      });
      const publishAt = body.publishAt === undefined ? current.publishAt : new Date(body.publishAt);
      const deadline = body.deadline === undefined ? current.deadline : new Date(body.deadline);
      const changed: EditableField[] = [];
      if (deadline?.getTime() !== current.deadline?.getTime()) changed.push("deadline");
      if (body.instructions !== undefined && body.instructions !== stored.instructions) changed.push("instructions");
      if (body.latePolicy !== undefined && body.latePolicy !== stored.latePolicy) changed.push("latePolicy");
      if (publishAt.getTime() !== current.publishAt.getTime()) changed.push("publishAt");
      if (body.title !== undefined && body.title !== stored.title) changed.push("title");
      if (changed.length === 0) return this.get(teacherId, classId, activityId, tx);

      const now = this.clock.now();
      if (changed.includes("publishAt") && ActivityStateMachine.phase(current.status, current.publishAt, now) !== "SCHEDULED") {
        throw new AppException("ALREADY_PUBLISHED");
      }
      if (deadline && deadline.getTime() <= publishAt.getTime()) throw new AppException("INVALID_SCHEDULE");

      await tx.classActivity.update({
        where: { id: activityId },
        data: {
          ...(changed.includes("title") ? { title: body.title } : {}),
          ...(changed.includes("instructions") ? { instructions: body.instructions } : {}),
          ...(changed.includes("latePolicy") ? { latePolicy: body.latePolicy } : {}),
          publishAt,
          deadline,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
        type: "activity.updated",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: { classId, fields: changed },
      });
      return this.get(teacherId, classId, activityId, tx);
    });
  }

  /** ACTIVE → CLOSED: nothing more is saved or submitted (FR-004); already CLOSED → as it is, no event. */
  close(auth: AuthContext, classId: string, activityId: string, requestId: string | null): Promise<TeacherActivity> {
    return this.transition(auth, classId, activityId, "CLOSED", requestId);
  }

  /** ACTIVE | CLOSED → CANCELLED: hidden from the students, submissions kept; already → no event. */
  cancel(auth: AuthContext, classId: string, activityId: string, requestId: string | null): Promise<TeacherActivity> {
    return this.transition(auth, classId, activityId, "CANCELLED", requestId);
  }

  /**
   * Releases the activity's result to the class (FR-006, research P14): the whole activity at once;
   * each student sees it once their grading is complete. Already released → as it is, no event;
   * CANCELLED → `409 INVALID_STATE_TRANSITION`. The activity `FOR UPDATE` serializes it with close
   * and cancel; its edit `version` doesn't change. An EXERCISE has no result to release (013 K14).
   */
  async release(auth: AuthContext, classId: string, activityId: string, requestId: string | null): Promise<TeacherActivity> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const current = await lockActivity(tx, classId, activityId);
      if (current.status === "CANCELLED" || current.type === "EXERCISE") throw invalidStateTransition();
      if (current.resultReleasedAt !== null) return this.get(teacherId, classId, activityId, tx);

      await tx.classActivity.update({
        where: { id: activityId },
        data: { resultReleasedAt: this.clock.now(), resultReleasedById: teacherId },
      });
      const submissions = await tx.activitySubmission.findMany({ where: { activityId }, select: { gradePartial: true } });
      await this.audit.record(tx, {
        type: "activity_result.released",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: {
          classId,
          submittedCount: submissions.length,
          completeCount: submissions.filter((submission) => !submission.gradePartial).length,
        },
      });
      return this.get(teacherId, classId, activityId, tx);
    });
  }

  private async transition(
    auth: AuthContext,
    classId: string,
    activityId: string,
    to: "CLOSED" | "CANCELLED",
    requestId: string | null,
  ): Promise<TeacherActivity> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const current = await lockActivity(tx, classId, activityId);
      if (!ActivityStateMachine.transition(current.status, to)) return this.get(teacherId, classId, activityId, tx);

      const now = this.clock.now();
      await tx.classActivity.update({
        where: { id: activityId },
        data: { status: to, ...(to === "CLOSED" ? { closedAt: now } : { cancelledAt: now }), version: { increment: 1 } },
      });
      const view = await this.get(teacherId, classId, activityId, tx);
      const submittedCount = view.counts.submitted + view.counts.submittedLate;
      await this.audit.record(tx, {
        type: to === "CLOSED" ? "activity.closed" : "activity.cancelled",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata: to === "CLOSED" ? { classId, submittedCount, missedCount: view.counts.missed } : { classId, from: current.status, submittedCount },
      });
      return view;
    });
  }

  /** The activity this key already created in this class; the same key in another class → 404. */
  private async replay(teacherId: string, classId: string, idempotencyKey: string) {
    const existing = await this.prisma.classActivity.findUnique({
      where: { teacherId_idempotencyKey: { teacherId, idempotencyKey } },
      select: { id: true, classId: true },
    });
    if (!existing) return null;
    if (existing.classId !== classId) throw notFound();
    return { view: await this.get(teacherId, classId, existing.id), created: false };
  }

  /** Apply, edit, close, cancel and release per teacher per hour (research P20). */
  private async assertWriteRate(teacherId: string): Promise<void> {
    const limit = await this.rateLimit.hit("activity-teacher-writes", teacherId, {
      limit: this.config.rateLimit.activityTeacherWritesPerHour,
      windowSec: HOUR_SEC,
    });
    if (limit.blocked) throw rateLimited(limit.retryAfterSec);
  }
}

/** The facts of the roster that come from the activity header. */
function rosterActivity(header: ActivityHeader) {
  return {
    id: header.id,
    type: header.type,
    status: header.status,
    deadline: header.deadline,
    latePolicy: header.latePolicy,
    released: header.resultReleasedAt !== null,
  };
}

/** A work goes only to a class of its subject; exercises have none (research P5). */
function assertSameSubject(classSubjectId: string | null, content: SourceContent): void {
  if (content.type === "ASSIGNMENT" && content.subjectId !== classSubjectId) throw new AppException("SUBJECT_MISMATCH");
}

/** The class row under `FOR SHARE`: its status can't change while the activity is created. */
async function lockClass(tx: Tx, teacherId: string, classId: string): Promise<{ status: string; subjectId: string | null }> {
  const rows = await tx.$queryRaw<{ status: string; subject_id: string | null }[]>`
    SELECT status::text AS status, subject_id FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
  if (rows.length === 0) throw notFound();
  return { status: rows[0]!.status, subjectId: rows[0]!.subject_id };
}

/** The activity of this class under `FOR UPDATE` (edits, transitions and release serialize). */
async function lockActivity(tx: Tx, classId: string, activityId: string): Promise<LockedActivity> {
  const rows = await tx.$queryRaw<
    { type: ActivityType; status: ActivityStatus; version: number; publish_at: Date; deadline: Date | null; result_released_at: Date | null }[]
  >`
    SELECT type::text AS type, status::text AS status, version, publish_at, deadline, result_released_at FROM class_activities
    WHERE id = ${activityId}::uuid AND class_id = ${classId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound();
  const row = rows[0]!;
  return {
    type: row.type,
    status: row.status,
    version: row.version,
    publishAt: row.publish_at,
    deadline: row.deadline,
    resultReleasedAt: row.result_released_at,
  };
}
