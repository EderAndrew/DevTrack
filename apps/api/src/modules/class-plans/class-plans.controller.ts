import { Controller, Get, Param, Post, Put } from "@nestjs/common";
import {
  type ClassPlanEnvelope,
  type ClassPlanView,
  type CreateTopicRequest,
  CreateTopicRequestSchema,
  type PlanCoverage,
  type SelectPlanSyllabusRequest,
  SelectPlanSyllabusRequestSchema,
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
}
