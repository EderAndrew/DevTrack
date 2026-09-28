import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AiErrorCode,
  batchCounts,
  type ExerciseBatchDetail,
  type ExerciseBatchListQuery,
  type ExerciseBatchPage,
  type ExerciseBatchRequest,
  type ExerciseBatchStatus,
  type ExerciseBatchView,
  type ExerciseGenerationAvailability,
  type ExerciseTypeCounts,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import { afterCursor, decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound, rateLimited, revisionNotConfirmed } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { AuditService } from "../audit/audit.service";
import { EXERCISE_RECORD_SELECT, toExerciseRecord } from "../exercises/exercise-query";
import { toTeacherView } from "../exercises/views/teacher-view";
import { EXERCISE_GENERATOR_KEY } from "./definitions/exercise-generator";
import { EXERCISE_GENERATION_BATCH } from "./generation/request-content";

export const EXERCISE_BATCHES_PAGE_SIZE = 20;

const PENDING_STATUSES: ReadonlySet<string> = new Set(["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"]);

const BATCH_VIEW_SELECT = {
  id: true,
  difficulty: true,
  requestedQuantity: true,
  openAnswerQuantity: true,
  multipleChoiceQuantity: true,
  codeQuantity: true,
  trickQuestionQuantity: true,
  distribution: true,
  createdAt: true,
  generatedAt: true,
  approvedCount: true,
  discardedCount: true,
  archivedCount: true,
  regeneratedFromId: true,
  language: { select: { name: true } },
  syllabusItem: { select: { id: true, text: true } },
  syllabusRevision: { select: { document: { select: { subject: { select: { name: true } } } } } },
  aiExecution: { select: { status: true, errorCode: true } },
  _count: { select: { exercises: { where: { status: "DRAFT" } } } },
} satisfies Prisma.ExerciseGenerationBatchSelect;

type BatchRow = Prisma.ExerciseGenerationBatchGetPayload<{ select: typeof BATCH_VIEW_SELECT }>;

/** Research X13: GENERATED once materialized, otherwise the execution's status says it. */
function statusOf(row: BatchRow): { status: ExerciseBatchStatus; failureCode: AiErrorCode | null } {
  if (row.generatedAt) return { status: "GENERATED", failureCode: null };
  const execution = row.aiExecution;
  if (!execution || PENDING_STATUSES.has(execution.status)) return { status: "PENDING", failureCode: null };
  const failureCode = (execution.errorCode as AiErrorCode | null) ?? null;
  return { status: execution.status === "CANCELLED" ? "CANCELLED" : "FAILED", failureCode };
}

function toBatchView(row: BatchRow): ExerciseBatchView {
  return {
    id: row.id,
    ...statusOf(row),
    topic: { syllabusItemId: row.syllabusItem.id, itemText: row.syllabusItem.text, subjectName: row.syllabusRevision.document.subject.name },
    difficulty: row.difficulty,
    total: row.requestedQuantity,
    counts: { OPEN_ANSWER: row.openAnswerQuantity, MULTIPLE_CHOICE: row.multipleChoiceQuantity, CODE: row.codeQuantity },
    trickQuestions: row.trickQuestionQuantity,
    language: row.language ? { name: row.language.name } : null,
    distribution: row.distribution === "MANUAL" ? "MANUAL" : "AUTO",
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    approved: row.approvedCount,
    discarded: row.discardedCount,
    archived: row.archivedCount,
    pendingReview: row._count.exercises,
    regeneratedFromId: row.regeneratedFromId,
  };
}

interface ResolvedTopic {
  languageId: string | null;
  languageKey: string | null;
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * "Criar com IA" (010 US2, research X8, X9): the teacher's batch is recorded and its generation
 * requested in one transaction, through the AI foundation, which re-checks the agent, the
 * permission, the resource and the model policy. The topic is always resolved within the session
 * teacher's syllabi; nothing here chooses a model, tier or family (FR-025). Logs carry only ids.
 */
@Injectable()
export class ExerciseBatchesService {
  private readonly logger = new Logger("ExerciseAi");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly executions: AiExecutionsService,
  ) {}

  async availability(): Promise<ExerciseGenerationAvailability> {
    return { availability: await this.executions.availability(EXERCISE_GENERATOR_KEY) };
  }

  /**
   * In the order of contracts/http-api.md: the topic and the regenerated batch (404, 422, 409),
   * the same key (the same batch, or 409 with another body), the per-teacher hourly limit (429),
   * then the foundation (agent, model, its own limits). `created: false` → 200 with the batch.
   */
  async request(auth: AuthContext, body: ExerciseBatchRequest, requestId: string | null): Promise<{ view: ExerciseBatchView; created: boolean }> {
    const teacherId = auth.userId;
    const counts = batchCounts(body);
    const topic = await this.resolveTopic(teacherId, body, counts);
    if (body.regeneratedFromId) {
      const previous = await this.prisma.exerciseGenerationBatch.findFirst({ where: { id: body.regeneratedFromId, teacherId }, select: { id: true } });
      if (!previous) throw notFound();
    }
    const existing = await this.findByKey(teacherId, body.idempotencyKey);
    if (existing) return this.replay(teacherId, existing.id, body, counts);
    await this.assertRequestRate(auth, requestId);

    const batchId = randomUUID();
    try {
      const { created } = await this.executions.request(
        auth,
        {
          agentKey: EXERCISE_GENERATOR_KEY,
          resource: { type: EXERCISE_GENERATION_BATCH, id: batchId },
          input: {},
          idempotencyKey: derivedUuid(`exercise-batch:${teacherId}:${body.idempotencyKey}`),
        },
        requestId,
        {
          beforeCreate: async (tx) => {
            await tx.exerciseGenerationBatch.create({
              data: {
                id: batchId,
                teacherId,
                syllabusItemId: body.syllabusItemId,
                syllabusRevisionId: body.syllabusRevisionId,
                difficulty: body.difficulty,
                requestedQuantity: body.total,
                openAnswerQuantity: counts.OPEN_ANSWER,
                multipleChoiceQuantity: counts.MULTIPLE_CHOICE,
                codeQuantity: counts.CODE,
                trickQuestionQuantity: body.trickQuestions,
                languageId: topic.languageId,
                distribution: body.distribution.mode,
                regeneratedFromId: body.regeneratedFromId ?? null,
                idempotencyKey: body.idempotencyKey,
              },
            });
          },
          onCreated: async (tx, executionId) => {
            await tx.exerciseGenerationBatch.update({ where: { id: batchId }, data: { aiExecutionId: executionId } });
            await this.audit.record(tx, {
              type: "exercise_batch.requested",
              actorType: "USER",
              actorUserId: teacherId,
              targetType: "EXERCISE_BATCH",
              targetId: batchId,
              requestId,
              metadata: {
                executionId,
                difficulty: body.difficulty,
                total: body.total,
                openAnswer: counts.OPEN_ANSWER,
                multipleChoice: counts.MULTIPLE_CHOICE,
                code: counts.CODE,
                trickQuestions: body.trickQuestions,
                languageKey: topic.languageKey,
                distribution: body.distribution.mode,
                regeneratedFromId: body.regeneratedFromId ?? null,
              },
            });
          },
        },
      );
      if (!created) return this.replayByKey(teacherId, body, counts);
    } catch (error) {
      // On this route 404 means only "topic outside your syllabi": an agent that isn't registered
      // is as unavailable as a disabled one (as 007).
      if (error instanceof AppException && error.code === "AI_AGENT_NOT_FOUND") throw new AppException("AI_AGENT_DISABLED");
      // A concurrent request with the same key won: answer its batch.
      if (isUniqueViolation(error) || (error instanceof AppException && error.code === "AI_IDEMPOTENCY_KEY_REUSED")) {
        return this.replayByKey(teacherId, body, counts);
      }
      throw error;
    }

    this.logger.log({ batchId, total: body.total }, "exercise_batch.requested");
    return { view: await this.view(teacherId, batchId), created: true };
  }

  async list(teacherId: string, { cursor }: ExerciseBatchListQuery): Promise<ExerciseBatchPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.exerciseGenerationBatch.findMany({
      where: { teacherId, ...(after ? afterCursor(after) : {}) },
      select: BATCH_VIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EXERCISE_BATCHES_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, EXERCISE_BATCHES_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(toBatchView),
      nextCursor: rows.length > EXERCISE_BATCHES_PAGE_SIZE && last ? encodeCursor(last) : null,
    };
  }

  async get(teacherId: string, batchId: string): Promise<ExerciseBatchDetail> {
    const batch = await this.view(teacherId, batchId);
    const exercises = await this.prisma.exercise.findMany({
      where: { teacherId, generationBatchId: batchId },
      select: EXERCISE_RECORD_SELECT,
      orderBy: [{ createdAt: "asc" }, { generationItemId: "asc" }],
    });
    return { batch, exercises: exercises.map((row) => toTeacherView(toExerciseRecord(row))) };
  }

  private async view(teacherId: string, batchId: string): Promise<ExerciseBatchView> {
    const row = await this.prisma.exerciseGenerationBatch.findFirst({ where: { id: batchId, teacherId }, select: BATCH_VIEW_SELECT });
    if (!row) throw notFound();
    return toBatchView(row);
  }

  /**
   * The topic of the request (research X9): an item of that revision, in a syllabus of the
   * teacher's (else 404, never revealing another teacher's), confirmed (422), of an active
   * subject (409), with a language when code is requested (422). Before any model call.
   */
  private async resolveTopic(teacherId: string, body: ExerciseBatchRequest, counts: ExerciseTypeCounts): Promise<ResolvedTopic> {
    const item = await this.prisma.syllabusItem.findFirst({
      where: { id: body.syllabusItemId, revisionId: body.syllabusRevisionId, revision: { document: { subject: { teacherId } } } },
      select: {
        revision: {
          select: { status: true, languageId: true, language: { select: { key: true } }, document: { select: { subject: { select: { status: true } } } } },
        },
      },
    });
    if (!item) throw notFound();
    const { revision } = item;
    if (revision.status !== "CONFIRMED") throw revisionNotConfirmed();
    if (revision.document.subject.status !== "ACTIVE") throw new AppException("SUBJECT_ARCHIVED");
    if (counts.CODE === 0) return { languageId: null, languageKey: null };
    if (!revision.languageId) throw new AppException("SYLLABUS_LANGUAGE_REQUIRED");
    return { languageId: revision.languageId, languageKey: revision.language?.key ?? null };
  }

  private findByKey(teacherId: string, idempotencyKey: string) {
    return this.prisma.exerciseGenerationBatch.findUnique({
      where: { teacherId_idempotencyKey: { teacherId, idempotencyKey } },
      select: { id: true },
    });
  }

  private async replayByKey(teacherId: string, body: ExerciseBatchRequest, counts: ExerciseTypeCounts) {
    const winner = await this.findByKey(teacherId, body.idempotencyKey);
    if (!winner) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return this.replay(teacherId, winner.id, body, counts);
  }

  /** The same key answers the same batch only for the same request (006 semantics). */
  private async replay(teacherId: string, batchId: string, body: ExerciseBatchRequest, counts: ExerciseTypeCounts) {
    const batch = await this.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: batchId } });
    const same =
      batch.syllabusItemId === body.syllabusItemId &&
      batch.syllabusRevisionId === body.syllabusRevisionId &&
      batch.difficulty === body.difficulty &&
      batch.requestedQuantity === body.total &&
      batch.openAnswerQuantity === counts.OPEN_ANSWER &&
      batch.multipleChoiceQuantity === counts.MULTIPLE_CHOICE &&
      batch.codeQuantity === counts.CODE &&
      batch.trickQuestionQuantity === body.trickQuestions &&
      batch.distribution === body.distribution.mode &&
      batch.regeneratedFromId === (body.regeneratedFromId ?? null);
    if (!same) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return { view: await this.view(teacherId, batchId), created: false };
  }

  /** Generations per teacher per hour (research X19), next to the 006 and 008 limits. */
  private async assertRequestRate(auth: AuthContext, requestId: string | null): Promise<void> {
    const limit = await this.rateLimit.hit("exercise-ai", auth.userId, { limit: this.config.rateLimit.exerciseAiPerHour, windowSec: 3600 });
    if (!limit.blocked) return;
    await this.audit.record(this.prisma, {
      type: "ai_execution.rate_limited",
      actorType: "USER",
      actorUserId: auth.userId,
      requestId,
      metadata: { scope: "exercise-ai" },
    });
    throw rateLimited(limit.retryAfterSec);
  }
}
