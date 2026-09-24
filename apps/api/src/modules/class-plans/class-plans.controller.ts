import { Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from "@nestjs/common";
import {
  type ClassPlanEnvelope,
  type ClassPlanView,
  type CreateTopicRequest,
  CreateTopicRequestSchema,
  type MergeTopicsRequest,
  MergeTopicsRequestSchema,
  type PlanCoverage,
  type ReorderTopicsRequest,
  ReorderTopicsRequestSchema,
  type SelectPlanSyllabusRequest,
  SelectPlanSyllabusRequestSchema,
  type SplitTopicRequest,
  SplitTopicRequestSchema,
  type TopicActionRequest,
  TopicActionRequestSchema,
  type TopicList,
  TopicListQuerySchema,
  type UpdateTopicRequest,
  UpdateTopicRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ClassPlansService } from "./class-plans.service";
import { TopicsService } from "./topics.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The class plan and its topics (004 contracts/http-api.md, "Planejamento e tópicos"). */
@Controller("classes/:id/plan")
export class ClassPlansController {
  constructor(
    private readonly plans: ClassPlansService,
    private readonly topics: TopicsService,
  ) {}

  @Get()
  @RequirePermissions("planejamento.visualizar")
  get(@Param("id", idPipe) classId: string, @Ctx() ctx: RequestContext): Promise<ClassPlanEnvelope> {
    return this.plans.getEnvelope(ctx.auth!.userId, classId);
  }

  /** Selects the confirmed syllabus revision the plan uses; creates the plan the first time. */
  @Put("syllabus")
  @RequirePermissions("planejamento.editar")
  selectSyllabus(
    @Param("id", idPipe) classId: string,
    @ZodBody(SelectPlanSyllabusRequestSchema) body: SelectPlanSyllabusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.plans.selectSyllabus(ctx.auth!, classId, body, ctx.requestId);
  }

  @Get("coverage")
  @RequirePermissions("planejamento.visualizar")
  coverage(@Param("id", idPipe) classId: string, @Ctx() ctx: RequestContext): Promise<PlanCoverage> {
    return this.plans.coverage(ctx.auth!.userId, classId);
  }

  @Post("topics")
  @RequirePermissions("planejamento.editar")
  createTopic(
    @Param("id", idPipe) classId: string,
    @ZodBody(CreateTopicRequestSchema) body: CreateTopicRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.create(ctx.auth!, classId, body, ctx.requestId);
  }

  /** "Tópicos arquivados" (`?status=ARCHIVED`, the only listing: the plan view has the others). */
  @Get("topics")
  @RequirePermissions("planejamento.visualizar")
  listArchived(
    @Param("id", idPipe) classId: string,
    @Query(new ZodValidationPipe(TopicListQuerySchema)) _query: unknown,
    @Ctx() ctx: RequestContext,
  ): Promise<TopicList> {
    return this.topics.listArchived(ctx.auth!.userId, classId);
  }

  @Patch("topics/:topicId")
  @RequirePermissions("planejamento.editar")
  updateTopic(
    @Param("id", idPipe) classId: string,
    @Param("topicId", idPipe) topicId: string,
    @ZodBody(UpdateTopicRequestSchema) body: UpdateTopicRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.update(ctx.auth!, classId, topicId, body, ctx.requestId);
  }

  /** The first topic stays; the others are archived pointing at it. */
  @Post("topics/merge")
  @HttpCode(200)
  @RequirePermissions("planejamento.editar")
  mergeTopics(
    @Param("id", idPipe) classId: string,
    @ZodBody(MergeTopicsRequestSchema) body: MergeTopicsRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.merge(ctx.auth!, classId, body, ctx.requestId);
  }

  @Post("topics/:topicId/split")
  @HttpCode(200)
  @RequirePermissions("planejamento.editar")
  splitTopic(
    @Param("id", idPipe) classId: string,
    @Param("topicId", idPipe) topicId: string,
    @ZodBody(SplitTopicRequestSchema) body: SplitTopicRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.split(ctx.auth!, classId, topicId, body, ctx.requestId);
  }

  @Post("topics/:topicId/archive")
  @HttpCode(200)
  @RequirePermissions("planejamento.editar")
  archiveTopic(
    @Param("id", idPipe) classId: string,
    @Param("topicId", idPipe) topicId: string,
    @ZodBody(TopicActionRequestSchema) body: TopicActionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.archive(ctx.auth!, classId, topicId, body.planRevision, ctx.requestId);
  }

  @Post("topics/:topicId/restore")
  @HttpCode(200)
  @RequirePermissions("planejamento.editar")
  restoreTopic(
    @Param("id", idPipe) classId: string,
    @Param("topicId", idPipe) topicId: string,
    @ZodBody(TopicActionRequestSchema) body: TopicActionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.restore(ctx.auth!, classId, topicId, body.planRevision, ctx.requestId);
  }

  /** Order and meetings of every non-archived topic, saved in one write. */
  @Put("topic-order")
  @RequirePermissions("planejamento.editar")
  reorderTopics(
    @Param("id", idPipe) classId: string,
    @ZodBody(ReorderTopicsRequestSchema) body: ReorderTopicsRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ClassPlanView> {
    return this.topics.reorder(ctx.auth!, classId, body, ctx.requestId);
  }
}
