import { Inject, Injectable } from "@nestjs/common";
import {
  type ActivitySource,
  type ActivityStatus,
  type ActivityType,
  type AiHelpAllowance,
  type CreateActivityRequest,
  type ExecutionMode,
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
import {
  ACTIVITY_HEADER_SELECT,
  ACTIVITY_QUESTION_SELECT,
  type ActivityHeader,
  aiHelpAllowanceOf,
  attendanceOf,
  loadPendingDecisions,
  loadPresentCounts,
  toQuestionRow,
} from "./activity-query";
import { ACTIVITY_TYPES } from "./activity-types";
import { ActivityStateMachine } from "./activity.state-machine";
import { ExamSettlement } from "./exam-settlement";
import { HelpAvailability } from "./help-availability";
import { buildRoster, loadRosterData } from "./roster";
import { scopeCheckOf } from "./scope/load-taught-scope";
import { examTiming } from "./status/facts";
import { startDeadline } from "./status/exam-time";
import { readSource, type SourceContent, toSnapshot } from "./snapshot/read-source";
import { settleExpiredExamAttempts } from "./submission/settle-exam";
import { writeSnapshot } from "./snapshot/write-snapshot";
import { toTeacherActivity, toTeacherActivitySummary } from "./views/teacher-view";

const HOUR_SEC = 3_600;

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** The fields a PATCH may change, in the order `activity.updated` lists them. */
type EditableField = "deadline" | "instructions" | "latePolicy" | "publishAt" | "title";

/** A work's 015 options (research F2): NORMAL and 0 unless the teacher turns them on. */
interface WorkOptions {
  executionMode: ExecutionMode;
  aiHelpAllowance: AiHelpAllowance;
}

const NO_WORK_OPTIONS: WorkOptions = { executionMode: "NORMAL", aiHelpAllowance: 0 };

/** An EXAM's options are the server's, never the body's (018/FR-010): always CONTROLLED, never any help. */
const EXAM_OPTIONS: WorkOptions = { executionMode: "CONTROLLED", aiHelpAllowance: 0 };

/** An EXAM's time from the body (018/FR-007), its ranges and defaults already checked by the contract. */
interface ExamTime {
  durationMinutes: number;
  inactivityLimitSeconds: number;
  startWindowMinutes: number;
}

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
    private readonly helpAvailability: HelpAvailability,
    private readonly examSettlement: ExamSettlement,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Every activity of the class, all statuses, by deadline (latest first), with the roster counts. */
  async list(teacherId: string, classId: string): Promise<{ items: TeacherActivitySummary[] }> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId);
    // 018 research T5: the class's expired exam attempts are settled before the rosters are read.
    await this.examSettlement.ofClass(classId, this.clock.now(), null);
    const headers = await this.prisma.classActivity.findMany({
      where: { classId },
      select: ACTIVITY_HEADER_SELECT,
      // An EXERCISE has no deadline (013 K1): it comes first, newest publication first.
      orderBy: [{ deadline: { sort: "desc", nulls: "first" } }, { publishAt: "desc" }, { id: "desc" }],
    });
    const { students, attempts, attendances } = await loadRosterData(this.prisma, classId, headers.map((header) => header.id));
    const present = await loadPresentCounts(this.prisma, headers.filter((header) => header.releaseMode === "PRESENT_ONLY").map((header) => header.id));
    const pending = await loadPendingDecisions(this.prisma, headers.filter((header) => header.type === "EXAM").map((header) => header.id));
    const enrolled = activeCount(students);
    const now = this.clock.now();
    return {
      items: headers.map((header) =>
        toTeacherActivitySummary(
          header,
          buildRoster(rosterActivity(header), students, attempts, attendances, schoolClass.status === "ACTIVE", now),
          now,
          attendanceOf(header, present, enrolled),
          pending.get(header.id) ?? 0,
        ),
      ),
    };
  }

  /** The activity with its roster; an exam's expired attempts are settled first (018 research T5). */
  async get(teacherId: string, classId: string, activityId: string): Promise<TeacherActivity> {
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.examSettlement.ofActivity(classId, activityId, this.clock.now(), null);
    return this.read(teacherId, classId, activityId);
  }

  /** The activity as it is, inside the caller's transaction (`db`) when given. */
  private async read(teacherId: string, classId: string, activityId: string, db: Tx = this.prisma): Promise<TeacherActivity> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId, db);
    const header = await db.classActivity.findFirst({ where: { id: activityId, classId }, select: ACTIVITY_HEADER_SELECT });
    if (!header) throw notFound();
    const questions = await db.classActivityQuestion.findMany({ where: { activityId }, select: ACTIVITY_QUESTION_SELECT });
    const { students, attempts, attendances } = await loadRosterData(db, classId, [activityId]);
    const now = this.clock.now();
    const roster = buildRoster(rosterActivity(header), students, attempts, attendances, schoolClass.status === "ACTIVE", now);
    const present = header.releaseMode === "PRESENT_ONLY" ? await loadPresentCounts(db, [activityId]) : new Map<string, number>();
    const pending = header.type === "EXAM" ? await loadPendingDecisions(db, [activityId]) : new Map<string, number>();
    return toTeacherActivity(
      header,
      questions.map(toQuestionRow),
      roster,
      now,
      attendanceOf(header, present, activeCount(students)),
      pending.get(activityId) ?? 0,
    );
  }

  /**
   * The topics of the source outside the class's taught scope (FR-005a, research P5), before the
   * teacher confirms, and an exam's coverage per topic and difficulty (018/FR-008); the creation
   * computes it again in its own transaction.
   */
  async scopeCheck(teacherId: string, classId: string, source: ActivitySource): Promise<ScopeCheck> {
    const schoolClass = await this.classes.findOwnedOrNotFound(teacherId, classId);
    return this.prisma.runInTransaction(async (tx) => {
      const content = await readSource(tx, teacherId, source);
      assertSameSubject(schoolClass.subjectId, content);
      return scopeCheckOf(tx, classId, toSnapshot(content).questions, examTopicsOf(content));
    });
  }

  /**
   * Applies the source to the class (FR-001, FR-002, FR-005, FR-005a), in the order of
   * contracts/http-api.md: the class (404), the same idempotency key (the activity it created,
   * `created: false`), the class ACTIVE (409), the schedule by the server clock (422), the hourly
   * limit (429), the AI help when asked (503, 015/FR-004), then in one transaction the source (404,
   * 422), the subject (422), the taught scope (422 unless acknowledged), the snapshot and
   * `activity.published`. A work carries its mode and AI help (015/FR-001); an EXERCISE body can't
   * (the contract refuses them, 015/FR-002). An EXAM carries its time instead of a deadline and is
   * always CONTROLLED, without help and `PRESENT_ONLY`, set here (018/FR-007, FR-010).
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
    // A type with a deadline (ASSIGNMENT) has it after the publication; an EXERCISE has neither deadline nor late
    // policy (013/FR-001, K1). The contract's union already refused a body that doesn't match its type.
    const schedule: { deadline: Date; latePolicy: LatePolicy } | null =
      ACTIVITY_TYPES[body.source.type].hasDeadline && "deadline" in body
        ? { deadline: new Date(body.deadline), latePolicy: body.latePolicy }
        : null;
    if (schedule && schedule.deadline.getTime() <= publishAt.getTime()) throw new AppException("INVALID_SCHEDULE");
    const examTime: ExamTime | null =
      "durationMinutes" in body
        ? { durationMinutes: body.durationMinutes, inactivityLimitSeconds: body.inactivityLimitSeconds, startWindowMinutes: body.startWindowMinutes }
        : null;
    const options: WorkOptions =
      ACTIVITY_TYPES[body.source.type].workOptions && "executionMode" in body
        ? { executionMode: body.executionMode, aiHelpAllowance: body.aiHelpAllowance }
        : examTime
          ? EXAM_OPTIONS
          : NO_WORK_OPTIONS;
    await this.assertWriteRate(teacherId);
    if (options.aiHelpAllowance > 0) await this.assertHelpAvailable();

    let activityId: string;
    try {
      activityId = await this.prisma.runInTransaction(async (tx) => {
        const schoolClass = await lockClass(tx, teacherId, classId);
        if (schoolClass.status !== "ACTIVE") throw new AppException("CLASS_NOT_ACTIVE");
        const content = await readSource(tx, teacherId, body.source);
        assertSameSubject(schoolClass.subjectId, content);
        const snapshot = toSnapshot(content);
        const scope = await scopeCheckOf(tx, classId, snapshot.questions, examTopicsOf(content));
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
            sourceExamId: content.type === "EXAM" ? content.examId : null,
            sourceSubjectId: content.type === "EXERCISE" ? null : content.subjectId,
            durationMinutes: examTime?.durationMinutes ?? null,
            inactivityLimitSeconds: examTime?.inactivityLimitSeconds ?? null,
            startWindowMinutes: examTime?.startWindowMinutes ?? null,
            outOfScopeTopicCount: scope.outOfScope.length,
            ...options,
            releaseMode: ACTIVITY_TYPES[content.type].releaseMode,
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
            executionMode: options.executionMode,
            aiHelpAllowance: options.aiHelpAllowance,
            releaseMode: ACTIVITY_TYPES[content.type].releaseMode,
            ...sourceMetadata(content),
            questionCount: snapshot.questions.length,
            // A grade and a late policy (ASSIGNMENT), a grade and the time (EXAM, 018) or the possible points (EXERCISE, 013 K15).
            ...(ACTIVITY_TYPES[content.type].scoring === "GRADE" && snapshot.totalCents !== null
              ? { totalCents: snapshot.totalCents, ...(schedule ? { latePolicy: schedule.latePolicy } : {}), ...(examTime ?? {}) }
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
   * EXERCISE has no deadline or late policy: either in the body → 400 (013/FR-004). A work's mode
   * and AI help (015/FR-005) change only while no student started it (`409 ACTIVITY_ALREADY_STARTED`,
   * checked under the activity's lock, as the trigger does), turning the help on asks the
   * `HelpAvailability` hook (503), and the change writes `activity.settings_changed`.
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
      const definition = ACTIVITY_TYPES[current.type];
      if (!definition.hasDeadline && (body.deadline !== undefined || body.latePolicy !== undefined)) throw validationError();
      if (!definition.workOptions && (body.executionMode !== undefined || body.aiHelpAllowance !== undefined)) throw validationError();
      if (current.version !== body.version) throw new AppException("ACTIVITY_VERSION_CONFLICT");
      ActivityStateMachine.assertEditable(current.status);

      const stored = await tx.classActivity.findUniqueOrThrow({
        where: { id: activityId },
        select: { title: true, instructions: true, latePolicy: true, executionMode: true, aiHelpAllowance: true },
      });
      const options: WorkOptions = {
        executionMode: body.executionMode ?? stored.executionMode,
        aiHelpAllowance: body.aiHelpAllowance ?? aiHelpAllowanceOf(stored.aiHelpAllowance),
      };
      const optionsChanged = options.executionMode !== stored.executionMode || options.aiHelpAllowance !== stored.aiHelpAllowance;
      const publishAt = body.publishAt === undefined ? current.publishAt : new Date(body.publishAt);
      const deadline = body.deadline === undefined ? current.deadline : new Date(body.deadline);
      const changed: EditableField[] = [];
      if (deadline?.getTime() !== current.deadline?.getTime()) changed.push("deadline");
      if (body.instructions !== undefined && body.instructions !== stored.instructions) changed.push("instructions");
      if (body.latePolicy !== undefined && body.latePolicy !== stored.latePolicy) changed.push("latePolicy");
      if (publishAt.getTime() !== current.publishAt.getTime()) changed.push("publishAt");
      if (body.title !== undefined && body.title !== stored.title) changed.push("title");
      if (changed.length === 0 && !optionsChanged) return this.read(teacherId, classId, activityId, tx);

      const now = this.clock.now();
      if (changed.includes("publishAt") && ActivityStateMachine.phase(current.status, current.publishAt, now) !== "SCHEDULED") {
        throw new AppException("ALREADY_PUBLISHED");
      }
      if (deadline && deadline.getTime() <= publishAt.getTime()) throw new AppException("INVALID_SCHEDULE");
      if (optionsChanged) {
        if ((await tx.activityAttempt.count({ where: { activityId } })) > 0) throw new AppException("ACTIVITY_ALREADY_STARTED");
        if (options.aiHelpAllowance > stored.aiHelpAllowance) await this.assertHelpAvailable();
      }

      await tx.classActivity.update({
        where: { id: activityId },
        data: {
          ...(changed.includes("title") ? { title: body.title } : {}),
          ...(changed.includes("instructions") ? { instructions: body.instructions } : {}),
          ...(changed.includes("latePolicy") ? { latePolicy: body.latePolicy } : {}),
          ...(optionsChanged ? options : {}),
          publishAt,
          deadline,
          version: { increment: 1 },
        },
      });
      const event = { actorType: "USER", actorUserId: teacherId, targetType: "CLASS_ACTIVITY", targetId: activityId, requestId } as const;
      if (changed.length > 0) await this.audit.record(tx, { ...event, type: "activity.updated", metadata: { classId, fields: changed } });
      if (optionsChanged) await this.audit.record(tx, { ...event, type: "activity.settings_changed", metadata: { classId, ...options } });
      return this.read(teacherId, classId, activityId, tx);
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
   * An EXAM with a hold still open → `409 EXAM_DECISIONS_PENDING` with the count (018/FR-024).
   */
  async release(auth: AuthContext, classId: string, activityId: string, requestId: string | null): Promise<TeacherActivity> {
    const teacherId = auth.userId;
    await this.classes.findOwnedOrNotFound(teacherId, classId);
    await this.assertWriteRate(teacherId);
    return this.prisma.runInTransaction(async (tx) => {
      const current = await lockActivity(tx, classId, activityId);
      if (current.status === "CANCELLED" || ACTIVITY_TYPES[current.type].scoring !== "GRADE") throw invalidStateTransition();
      if (current.resultReleasedAt !== null) return this.read(teacherId, classId, activityId, tx);
      // 018 research T5, T10: an exam's expired attempts become submissions before the release counts
      // them, and no result is released while a hold waits for the teacher's decision (FR-024).
      await settleExpiredExamAttempts(tx, this.audit, { classId, activityId, now: this.clock.now(), requestId });
      if (current.type === "EXAM") {
        const pending = (await loadPendingDecisions(tx, [activityId])).get(activityId) ?? 0;
        if (pending > 0) throw new AppException("EXAM_DECISIONS_PENDING", undefined, {}, { count: pending });
      }

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
      return this.read(teacherId, classId, activityId, tx);
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
      if (!ActivityStateMachine.transition(current.status, to)) return this.read(teacherId, classId, activityId, tx);

      const now = this.clock.now();
      // 016 research M7: the open pauses this close or cancellation ends by derivation, never by a write.
      const [{ paused }] = await tx.$queryRaw<[{ paused: number }]>`
        SELECT count(*)::int AS paused FROM attempt_pauses p
        JOIN activity_attempts a ON a.id = p.attempt_id
        WHERE p.activity_id = ${activityId}::uuid AND p.released_at IS NULL AND a.status = 'IN_PROGRESS'`;
      await tx.classActivity.update({
        where: { id: activityId },
        data: { status: to, ...(to === "CLOSED" ? { closedAt: now } : { cancelledAt: now }), version: { increment: 1 } },
      });
      const view = await this.read(teacherId, classId, activityId, tx);
      const submittedCount = view.counts.submitted + view.counts.submittedLate;
      await this.audit.record(tx, {
        type: to === "CLOSED" ? "activity.closed" : "activity.cancelled",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_ACTIVITY",
        targetId: activityId,
        requestId,
        metadata:
          to === "CLOSED"
            ? { classId, submittedCount, missedCount: view.counts.missed, pausedCount: paused }
            : { classId, from: current.status, submittedCount, pausedCount: paused },
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

  /** The AI help can't be promised when the `work-helper` can't serve it (015/FR-004, research F3). */
  private async assertHelpAvailable(): Promise<void> {
    if (!(await this.helpAvailability.check()).available) throw new AppException("AI_HELP_UNAVAILABLE");
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
/** The class's ACTIVE students: the "m" of "n de m presentes" (016/FR-006). */
const activeCount = (students: readonly { enrollment: string }[]) => students.filter((student) => student.enrollment === "ACTIVE").length;

function rosterActivity(header: ActivityHeader) {
  return {
    id: header.id,
    type: header.type,
    status: header.status,
    deadline: header.deadline,
    latePolicy: header.latePolicy,
    released: header.resultReleasedAt !== null,
    releaseMode: header.releaseMode,
    endedAt: header.closedAt ?? header.cancelledAt,
    startDeadline: header.type === "EXAM" ? startDeadline(examTiming(header)) : null,
    durationMinutes: header.durationMinutes,
  };
}

/** The source of `activity.published`: the work, the number of exercises, or the exam (018). */
function sourceMetadata(content: SourceContent): Record<string, string | number> {
  if (content.type === "ASSIGNMENT") return { sourceWorkId: content.workId };
  if (content.type === "EXAM") return { sourceExamId: content.examId };
  return { sourceExerciseCount: content.exerciseIds.length };
}

/** An exam's topics in its order, for its coverage (018 research T15); null for the other sources. */
const examTopicsOf = (content: SourceContent) => (content.type === "EXAM" ? content.exam.topics : null);

/** A work or an exam goes only to a class of its subject (018/FR-007); exercises have none (research P5). */
function assertSameSubject(classSubjectId: string | null, content: SourceContent): void {
  if (content.type !== "EXERCISE" && content.subjectId !== classSubjectId) throw new AppException("SUBJECT_MISMATCH");
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
