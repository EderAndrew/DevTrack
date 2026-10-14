import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  type AiErrorCode,
  centsToGrade,
  type CreateExamGenerationRequest,
  type ExamGenerationAvailability,
  type ExamGenerationRequest,
  gradeToCents,
  type WorkGenerationRequestStatus,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, notFound, rateLimited } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { AiExecutionsService } from "../ai/execution/ai-executions.service";
import { AuditService } from "../audit/audit.service";
import { decimalToCents } from "../exams/exam-query";
import { type ResolvedExamTopics, ExamTopics } from "../exams/exam-topics";
import { EXAM_GENERATOR_KEY } from "./definitions/exam-generator";
import { EXAM_GENERATION_REQUEST } from "./generation/request-content";

const PENDING_STATUSES: ReadonlySet<string> = new Set(["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"]);

const REQUEST_VIEW_SELECT = {
  id: true,
  syllabusRevisionId: true,
  title: true,
  difficulty: true,
  totalGrade: true,
  requestedQuantity: true,
  openAnswerQuantity: true,
  multipleChoiceQuantity: true,
  codeQuantity: true,
  trickQuestionQuantity: true,
  aiExecutionId: true,
  createdAt: true,
  generatedAt: true,
  subject: { select: { id: true, name: true } },
  topics: { select: { syllabusItem: { select: { id: true, text: true } } }, orderBy: { position: "asc" } },
  aiExecution: { select: { status: true, errorCode: true } },
  exam: { select: { id: true } },
} satisfies Prisma.ExamGenerationRequestSelect;

type RequestRow = Prisma.ExamGenerationRequestGetPayload<{ select: typeof REQUEST_VIEW_SELECT }>;

/** GENERATED once materialized, otherwise the execution's status says it (never stored, as 011). */
function statusOf(row: RequestRow): { status: WorkGenerationRequestStatus; failureCode: AiErrorCode | null } {
  if (row.generatedAt) return { status: "GENERATED", failureCode: null };
  const execution = row.aiExecution;
  if (!execution || PENDING_STATUSES.has(execution.status)) return { status: "PENDING", failureCode: null };
  const failureCode = (execution.errorCode as AiErrorCode | null) ?? null;
  return { status: execution.status === "CANCELLED" ? "CANCELLED" : "FAILED", failureCode };
}

function toRequestView(row: RequestRow): ExamGenerationRequest {
  return {
    id: row.id,
    ...statusOf(row),
    subject: row.subject,
    syllabusRevisionId: row.syllabusRevisionId,
    topics: row.topics.map(({ syllabusItem }) => ({ syllabusItemId: syllabusItem.id, itemText: syllabusItem.text })),
    title: row.title,
    difficulty: row.difficulty,
    totalGrade: centsToGrade(decimalToCents(row.totalGrade)),
    quantity: row.requestedQuantity,
    distribution: { OPEN_ANSWER: row.openAnswerQuantity, MULTIPLE_CHOICE: row.multipleChoiceQuantity, CODE: row.codeQuantity },
    trickCount: row.trickQuestionQuantity,
    executionId: row.aiExecutionId,
    createdAt: row.createdAt.toISOString(),
    generatedAt: row.generatedAt?.toISOString() ?? null,
    examId: row.exam?.id ?? null,
  };
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * "Criar prova com IA" (018/US7, research T14): the teacher's request and its topics are recorded and
 * the generation requested in one transaction, through the AI foundation, which re-checks the agent,
 * the permission, the resource and the model policy. Topics are always resolved within the session
 * teacher's syllabi; nothing here chooses a model (018/US7-4). The result is a DRAFT exam that only the
 * teacher approves (FR-006). Logs carry only ids and counts.
 */
@Injectable()
export class ExamGenerationRequestsService {
  private readonly logger = new Logger("ExamAi");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly executions: AiExecutionsService,
    private readonly examTopics: ExamTopics,
  ) {}

  async availability(): Promise<ExamGenerationAvailability> {
    return { availability: await this.executions.availability(EXAM_GENERATOR_KEY) };
  }

  /**
   * In order: the topics (404, 422, 409), the same key (the same request, or 409 with another body),
   * the per-teacher hourly limit (429), then the foundation (agent, model, its own limits).
   * `created: false` → 200 with the request.
   */
  async request(auth: AuthContext, body: CreateExamGenerationRequest, requestId: string | null): Promise<{ view: ExamGenerationRequest; created: boolean }> {
    const teacherId = auth.userId;
    const resolved = await this.resolveTopics(teacherId, body);
    const existing = await this.findByKey(teacherId, body.idempotencyKey);
    if (existing) return this.replay(teacherId, existing.id, body);
    await this.assertRequestRate(auth, requestId);

    const examRequestId = randomUUID();
    const languageId = body.distribution.CODE > 0 ? resolved.revision.languageId : null;
    try {
      const { created } = await this.executions.request(
        auth,
        {
          agentKey: EXAM_GENERATOR_KEY,
          resource: { type: EXAM_GENERATION_REQUEST, id: examRequestId },
          input: {},
          idempotencyKey: derivedUuid(`exam-generation:${teacherId}:${body.idempotencyKey}`),
        },
        requestId,
        {
          beforeCreate: async (tx) => {
            await tx.examGenerationRequest.create({
              data: {
                id: examRequestId,
                teacherId,
                subjectId: resolved.subject.id,
                syllabusRevisionId: resolved.revision.id,
                title: body.title,
                difficulty: body.difficulty,
                totalGrade: centsToGrade(gradeToCents(body.totalGrade)),
                requestedQuantity: body.quantity,
                openAnswerQuantity: body.distribution.OPEN_ANSWER,
                multipleChoiceQuantity: body.distribution.MULTIPLE_CHOICE,
                codeQuantity: body.distribution.CODE,
                trickQuestionQuantity: body.trickCount,
                languageId,
                idempotencyKey: body.idempotencyKey,
              },
            });
            await tx.examGenerationRequestTopic.createMany({
              data: resolved.topics.map((topic, position) => ({
                requestId: examRequestId,
                syllabusItemId: topic.syllabusItemId,
                syllabusRevisionId: resolved.revision.id,
                position,
              })),
            });
          },
          onCreated: async (tx, executionId) => {
            await tx.examGenerationRequest.update({ where: { id: examRequestId }, data: { aiExecutionId: executionId } });
            await this.audit.record(tx, {
              type: "exam_generation.requested",
              actorType: "USER",
              actorUserId: teacherId,
              targetType: "EXAM_GENERATION_REQUEST",
              targetId: examRequestId,
              requestId,
              metadata: { subjectId: resolved.subject.id, quantity: body.quantity, topicCount: resolved.topics.length },
            });
          },
        },
      );
      if (!created) return this.replayByKey(teacherId, body);
    } catch (error) {
      // On this route 404 means only "topic outside your syllabi": an agent that isn't registered is
      // as unavailable as a disabled one (as 011).
      if (error instanceof AppException && error.code === "AI_AGENT_NOT_FOUND") throw new AppException("AI_AGENT_DISABLED");
      // A concurrent request with the same key won: answer its request.
      if (isUniqueViolation(error) || (error instanceof AppException && error.code === "AI_IDEMPOTENCY_KEY_REUSED")) return this.replayByKey(teacherId, body);
      throw error;
    }

    this.logger.log({ examRequestId, quantity: body.quantity, topics: resolved.topics.length }, "exam_generation.requested");
    return { view: await this.get(teacherId, examRequestId), created: true };
  }

  async get(teacherId: string, examRequestId: string): Promise<ExamGenerationRequest> {
    const row = await this.prisma.examGenerationRequest.findFirst({ where: { id: examRequestId, teacherId }, select: REQUEST_VIEW_SELECT });
    if (!row) throw notFound();
    return toRequestView(row);
  }

  /**
   * The topics of the request: items of that confirmed revision of the teacher's subject (else 404 or
   * 422, never revealing another teacher's), an active subject (409), a language on the revision when
   * code is requested (422). Before any model call.
   */
  private async resolveTopics(teacherId: string, body: CreateExamGenerationRequest): Promise<ResolvedExamTopics> {
    const resolved = await this.examTopics.resolve(teacherId, body.subjectId, body.syllabusRevisionId, body.topicIds);
    if (resolved.subject.status !== "ACTIVE") throw new AppException("SUBJECT_ARCHIVED");
    if (body.distribution.CODE > 0 && !resolved.revision.languageId) throw new AppException("SYLLABUS_LANGUAGE_REQUIRED");
    return resolved;
  }

  private findByKey(teacherId: string, idempotencyKey: string) {
    return this.prisma.examGenerationRequest.findUnique({ where: { teacherId_idempotencyKey: { teacherId, idempotencyKey } }, select: { id: true } });
  }

  private async replayByKey(teacherId: string, body: CreateExamGenerationRequest) {
    const winner = await this.findByKey(teacherId, body.idempotencyKey);
    if (!winner) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return this.replay(teacherId, winner.id, body);
  }

  /** The same key answers the same request only for the same body (006 semantics). */
  private async replay(teacherId: string, examRequestId: string, body: CreateExamGenerationRequest) {
    const row = await this.prisma.examGenerationRequest.findUniqueOrThrow({
      where: { id: examRequestId },
      include: { topics: { select: { syllabusItemId: true }, orderBy: { position: "asc" } } },
    });
    const same =
      row.subjectId === body.subjectId &&
      row.syllabusRevisionId === body.syllabusRevisionId &&
      row.topics.map((topic) => topic.syllabusItemId).join() === body.topicIds.join() &&
      row.title === body.title &&
      row.difficulty === body.difficulty &&
      decimalToCents(row.totalGrade) === gradeToCents(body.totalGrade) &&
      row.requestedQuantity === body.quantity &&
      row.openAnswerQuantity === body.distribution.OPEN_ANSWER &&
      row.multipleChoiceQuantity === body.distribution.MULTIPLE_CHOICE &&
      row.codeQuantity === body.distribution.CODE &&
      row.trickQuestionQuantity === body.trickCount;
    if (!same) throw new AppException("AI_IDEMPOTENCY_KEY_REUSED");
    return { view: await this.get(teacherId, examRequestId), created: false };
  }

  /** "Criar prova com IA" requests per teacher per hour (`RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR`). */
  private async assertRequestRate(auth: AuthContext, requestId: string | null): Promise<void> {
    const limit = await this.rateLimit.hit("exam-ai", auth.userId, { limit: this.config.rateLimit.examGenerationsPerHour, windowSec: 3600 });
    if (!limit.blocked) return;
    await this.audit.record(this.prisma, {
      type: "ai_execution.rate_limited",
      actorType: "USER",
      actorUserId: auth.userId,
      requestId,
      metadata: { scope: "exam-ai" },
    });
    throw rateLimited(limit.retryAfterSec);
  }
}
