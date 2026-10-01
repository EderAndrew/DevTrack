import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AiErrorCode,
  centsToGrade,
  gradeToCents,
  type WorkGenerationAvailability,
  type WorkGenerationRequest,
  type WorkGenerationRequestListQuery,
  type WorkGenerationRequestPage,
  type WorkGenerationRequestView,
  type WorkQuestionTypeCounts,
  type WorkGenerationRequestStatus,
  workGenerationCounts,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import { afterCursor, decodeCursor, encodeCursor } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { AuditService } from "../audit/audit.service";
import { decimalToCents } from "../works/work-query";
import { type ResolvedWorkTopics, WorkTopics } from "../works/work-topics";
import { WORK_GENERATOR_KEY } from "./definitions/work-generator";
import { WORK_GENERATION_REQUEST } from "./generation/request-content";

export const WORK_GENERATION_REQUESTS_PAGE_SIZE = 20;

const PENDING_STATUSES: ReadonlySet<string> = new Set(["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"]);

const REQUEST_VIEW_SELECT = {
  id: true,
  subjectId: true,
  syllabusRevisionId: true,
  title: true,
  description: true,
  difficulty: true,
  totalGrade: true,
  requestedQuantity: true,
  openAnswerQuantity: true,
  multipleChoiceQuantity: true,
  codeQuantity: true,
  trickQuestionQuantity: true,
  distribution: true,
  aiExecutionId: true,
  createdAt: true,
  generatedAt: true,
  regeneratedFromId: true,
  subject: { select: { id: true, name: true } },
  language: { select: { name: true } },
  topics: { select: { syllabusItem: { select: { id: true, text: true } } }, orderBy: { position: "asc" } },
  aiExecution: { select: { status: true, errorCode: true } },
  work: { select: { id: true } },
} satisfies Prisma.WorkGenerationRequestSelect;

type RequestRow = Prisma.WorkGenerationRequestGetPayload<{ select: typeof REQUEST_VIEW_SELECT }>;

/** Research W10 (010 X13): GENERATED once materialized, otherwise the execution's status says it. */
function statusOf(row: RequestRow): { status: WorkGenerationRequestStatus; failureCode: AiErrorCode | null } {
  if (row.generatedAt) return { status: "GENERATED", failureCode: null };
  const execution = row.aiExecution;
  if (!execution || PENDING_STATUSES.has(execution.status)) return { status: "PENDING", failureCode: null };
  const failureCode = (execution.errorCode as AiErrorCode | null) ?? null;
  return { status: execution.status === "CANCELLED" ? "CANCELLED" : "FAILED", failureCode };
}

function toRequestView(row: RequestRow): WorkGenerationRequestView {
  return {
    id: row.id,
    ...statusOf(row),
    subject: row.subject,
    syllabusRevisionId: row.syllabusRevisionId,
    topics: row.topics.map(({ syllabusItem }) => ({ syllabusItemId: syllabusItem.id, itemText: syllabusItem.text })),
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    totalGrade: centsToGrade(decimalToCents(row.totalGrade)),
    total: row.requestedQuantity,
    counts: { OPEN_ANSWER: row.openAnswerQuantity, MULTIPLE_CHOICE: row.multipleChoiceQuantity, CODE: row.codeQuantity },
    trickQuestions: row.trickQuestionQuantity,
    language: row.language ? { name: row.language.name } : null,
    distribution: row.distribution === "MANUAL" ? "MANUAL" : "AUTO",
    executionId: row.aiExecutionId,
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    workId: row.work?.id ?? null,
    regeneratedFromId: row.regeneratedFromId,
  };
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * "Criar trabalho com IA" (011 US3, research W10, W11): the teacher's request and its topics are
 * recorded and the generation requested in one transaction, through the AI foundation, which
 * re-checks the agent, the permission, the resource and the model policy. Topics are always
 * resolved within the session teacher's syllabi; nothing here chooses a model (FR-024). Logs
 * carry only ids and counts.
 */
@Injectable()
export class WorkGenerationRequestsService {
  private readonly logger = new Logger("WorkAi");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly executions: AiExecutionsService,
    private readonly workTopics: WorkTopics,
  ) {}

  async availability(): Promise<WorkGenerationAvailability> {
    return { availability: await this.executions.availability(WORK_GENERATOR_KEY) };
  }

  /**
   * In the order of contracts/http-api.md: the topics and the regenerated request (404, 422, 409),
   * the same key (the same request, or 409 with another body), the per-teacher hourly limit (429),
   * then the foundation (agent, model, its own limits). `created: false` → 200 with the request.
   */
  async request(auth: AuthContext, body: WorkGenerationRequest, requestId: string | null): Promise<{ view: WorkGenerationRequestView; created: boolean }> {
    const teacherId = auth.userId;
    const counts = workGenerationCounts(body);
    const resolved = await this.resolveTopics(teacherId, body, counts);
    const revision = resolved.revision!;
    if (body.regeneratedFromId) {
      const previous = await this.prisma.workGenerationRequest.findFirst({ where: { id: body.regeneratedFromId, teacherId }, select: { id: true } });
      if (!previous) throw notFound();
    }
    const existing = await this.findByKey(teacherId, body.idempotencyKey);
    if (existing) return this.replay(teacherId, existing.id, body, counts);
    await this.assertRequestRate(auth, requestId);

    const workRequestId = randomUUID();
    const languageId = counts.CODE > 0 ? revision.languageId : null;
    try {
      const { created } = await this.executions.request(
        auth,
        {
          agentKey: WORK_GENERATOR_KEY,
          resource: { type: WORK_GENERATION_REQUEST, id: workRequestId },
          input: {},
          idempotencyKey: derivedUuid(`work-generation:${teacherId}:${body.idempotencyKey}`),
        },
        requestId,
        {
          beforeCreate: async (tx) => {
            await tx.workGenerationRequest.create({
              data: {
                id: workRequestId,
                teacherId,
                subjectId: resolved.subject.id,
                syllabusRevisionId: revision.id,
                title: body.title,
                description: body.description ?? null,
                difficulty: body.difficulty,
                totalGrade: centsToGrade(gradeToCents(body.totalGrade)),
                requestedQuantity: body.total,
                openAnswerQuantity: counts.OPEN_ANSWER,
                multipleChoiceQuantity: counts.MULTIPLE_CHOICE,
                codeQuantity: counts.CODE,
                trickQuestionQuantity: body.trickQuestions,
                languageId,
                distribution: body.distribution.mode,
                regeneratedFromId: body.regeneratedFromId ?? null,
                idempotencyKey: body.idempotencyKey,
              },
            });
            await tx.workGenerationRequestTopic.createMany({
              data: resolved.topics.map((topic, position) => ({
                requestId: workRequestId,
                syllabusItemId: topic.syllabusItemId,
                syllabusRevisionId: revision.id,
                position,
              })),
            });
          },
          onCreated: async (tx, executionId) => {
            await tx.workGenerationRequest.update({ where: { id: workRequestId }, data: { aiExecutionId: executionId } });
            await this.audit.record(tx, {
              type: "work_generation.requested",
              actorType: "USER",
              actorUserId: teacherId,
              targetType: "WORK_GENERATION_REQUEST",
              targetId: workRequestId,
              requestId,
              metadata: {
                executionId,
                subjectId: resolved.subject.id,
                topicCount: resolved.topics.length,
                difficulty: body.difficulty,
                total: body.total,
                openAnswer: counts.OPEN_ANSWER,
                multipleChoice: counts.MULTIPLE_CHOICE,
                code: counts.CODE,
                trickQuestions: body.trickQuestions,
                languageKey: languageId === null ? null : revision.languageKey,
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
      // is as unavailable as a disabled one (as 007 and 010).
      if (error instanceof AppException && error.code === "AI_AGENT_NOT_FOUND") throw new AppException("AI_AGENT_DISABLED");
      // A concurrent request with the same key won: answer its request.
      if (isUniqueViolation(error) || (error instanceof AppException && error.code === "AI_IDEMPOTENCY_KEY_REUSED")) {
        return this.replayByKey(teacherId, body, counts);
      }
      throw error;
    }

    this.logger.log({ workRequestId, total: body.total, topics: resolved.topics.length }, "work_generation.requested");
    return { view: await this.get(teacherId, workRequestId), created: true };
  }

  async list(teacherId: string, { cursor }: WorkGenerationRequestListQuery): Promise<WorkGenerationRequestPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const rows = await this.prisma.workGenerationRequest.findMany({
      where: { teacherId, ...(after ? afterCursor(after) : {}) },
      select: REQUEST_VIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: WORK_GENERATION_REQUESTS_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, WORK_GENERATION_REQUESTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(toRequestView),
      nextCursor: rows.length > WORK_GENERATION_REQUESTS_PAGE_SIZE && last ? encodeCursor(last) : null,
    };
  }

  async get(teacherId: string, workRequestId: string): Promise<WorkGenerationRequestView> {
    const row = await this.prisma.workGenerationRequest.findFirst({ where: { id: workRequestId, teacherId }, select: REQUEST_VIEW_SELECT });
    if (!row) throw notFound();
    return toRequestView(row);
  }

  /**
   * The topics of the request (research W11): items of that confirmed revision of the teacher's
   * subject (else 404 or 422, never revealing another teacher's), an active subject (409), a
   * language on the revision when code is requested (422). Before any model call.
   */
  private async resolveTopics(teacherId: string, body: WorkGenerationRequest, counts: WorkQuestionTypeCounts): Promise<ResolvedWorkTopics> {
    const resolved = await this.workTopics.resolve(teacherId, body.subjectId, {
      syllabusRevisionId: body.syllabusRevisionId,
      syllabusItemIds: body.syllabusItemIds,
    });
    if (resolved.subject.status !== "ACTIVE") throw new AppException("SUBJECT_ARCHIVED");
    if (counts.CODE > 0 && !resolved.revision!.languageId) throw new AppException("SYLLABUS_LANGUAGE_REQUIRED");
    return resolved;
  }

  private findByKey(teacherId: string, idempotencyKey: string) {
    return this.prisma.workGenerationRequest.findUnique({
      where: { teacherId_idempotencyKey: { teacherId, idempotencyKey } },
      select: { id: true },
    });
  }

  private async replayByKey(teacherId: string, body: WorkGenerationRequest, counts: WorkQuestionTypeCounts) {
    const winner = await this.findByKey(teacherId, body.idempotencyKey);
    if (!winner) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return this.replay(teacherId, winner.id, body, counts);
  }

  /** The same key answers the same request only for the same body (006 semantics). */
  private async replay(teacherId: string, workRequestId: string, body: WorkGenerationRequest, counts: WorkQuestionTypeCounts) {
    const row = await this.prisma.workGenerationRequest.findUniqueOrThrow({
      where: { id: workRequestId },
      include: { topics: { select: { syllabusItemId: true }, orderBy: { position: "asc" } } },
    });
    const same =
      row.subjectId === body.subjectId &&
      row.syllabusRevisionId === body.syllabusRevisionId &&
      row.topics.map((topic) => topic.syllabusItemId).join() === body.syllabusItemIds.join() &&
      row.title === body.title &&
      row.description === (body.description ?? null) &&
      row.difficulty === body.difficulty &&
      decimalToCents(row.totalGrade) === gradeToCents(body.totalGrade) &&
      row.requestedQuantity === body.total &&
      row.openAnswerQuantity === counts.OPEN_ANSWER &&
      row.multipleChoiceQuantity === counts.MULTIPLE_CHOICE &&
      row.codeQuantity === counts.CODE &&
      row.trickQuestionQuantity === body.trickQuestions &&
      row.distribution === body.distribution.mode &&
      row.regeneratedFromId === (body.regeneratedFromId ?? null);
    if (!same) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return { view: await this.get(teacherId, workRequestId), created: false };
  }

  /** Generations per teacher per hour (research W18), next to the 006 and 008 limits. */
  private async assertRequestRate(auth: AuthContext, requestId: string | null): Promise<void> {
    const limit = await this.rateLimit.hit("work-ai", auth.userId, { limit: this.config.rateLimit.workAiPerHour, windowSec: 3600 });
    if (!limit.blocked) return;
    await this.audit.record(this.prisma, {
      type: "ai_execution.rate_limited",
      actorType: "USER",
      actorUserId: auth.userId,
      requestId,
      metadata: { scope: "work-ai" },
    });
    throw rateLimited(limit.retryAfterSec);
  }
}
