import { Controller, Get, HttpCode, Param, Patch, Post, Res } from "@nestjs/common";
import {
  type ActivitySource,
  ActivitySourceSchema,
  type CreateActivityRequest,
  CreateActivityRequestSchema,
  EmptyBodySchema,
  type ScopeCheck,
  type TeacherActivity,
  type TeacherActivitySummary,
  type UpdateActivityRequest,
  UpdateActivityRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ActivitiesService } from "./activities.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The class's activities, teacher side (012 contracts/http-api.md, "Teacher routes"); another teacher's class → 404. */
@Controller("classes/:classId/activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermissions("atividades.visualizar")
  list(@Param("classId", idPipe) classId: string, @Ctx() ctx: RequestContext): Promise<{ items: TeacherActivitySummary[] }> {
    return this.activities.list(ctx.auth!.userId, classId);
  }

  /** Topics of the source outside the taught scope (FR-005a); declared before `:activityId`. */
  @Post("scope-check")
  @HttpCode(200)
  @RequirePermissions("atividades.aplicar")
  scopeCheck(
    @Param("classId", idPipe) classId: string,
    @ZodBody(ActivitySourceSchema) body: ActivitySource,
    @Ctx() ctx: RequestContext,
  ): Promise<ScopeCheck> {
    return this.activities.scopeCheck(ctx.auth!.userId, classId, body);
  }

  /** 201 for a new activity; 200 when the same idempotency key returns the one it created. */
  @Post()
  @RequirePermissions("atividades.aplicar")
  async create(
    @Param("classId", idPipe) classId: string,
    @ZodBody(CreateActivityRequestSchema) body: CreateActivityRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TeacherActivity> {
    const { view, created } = await this.activities.create(ctx.auth!, classId, body, ctx.requestId);
    res.status(created ? 201 : 200);
    return view;
  }

  @Get(":activityId")
  @RequirePermissions("atividades.visualizar")
  get(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherActivity> {
    return this.activities.get(ctx.auth!.userId, classId, activityId);
  }

  @Patch(":activityId")
  @RequirePermissions("atividades.aplicar")
  update(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(UpdateActivityRequestSchema) body: UpdateActivityRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherActivity> {
    return this.activities.update(ctx.auth!, classId, activityId, body, ctx.requestId);
  }

  @Post(":activityId/close")
  @HttpCode(200)
  @RequirePermissions("atividades.aplicar")
  close(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherActivity> {
    return this.activities.close(ctx.auth!, classId, activityId, ctx.requestId);
  }

  @Post(":activityId/cancel")
  @HttpCode(200)
  @RequirePermissions("atividades.aplicar")
  cancel(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherActivity> {
    return this.activities.cancel(ctx.auth!, classId, activityId, ctx.requestId);
  }
}
