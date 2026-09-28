import { Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  type CreateExerciseRequest,
  CreateExerciseRequestSchema,
  type ExerciseListQuery,
  ExerciseListQuerySchema,
  type ExercisePage,
  type ExerciseSet,
  type ExerciseSetRequest,
  ExerciseSetRequestSchema,
  type ExerciseTeacherView,
  type ExerciseVersionRequest,
  ExerciseVersionRequestSchema,
  type UpdateExerciseRequest,
  UpdateExerciseRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExercisesService } from "./exercises.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's own exercises (010 contracts/http-api.md, "Exercises"); other teachers' are 404. */
@Controller("exercises")
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Post("sets")
  @RequirePermissions("questoes.criar")
  async createSet(@ZodBody(ExerciseSetRequestSchema) body: ExerciseSetRequest, @Ctx() ctx: RequestContext): Promise<ExerciseSet> {
    return { items: await this.exercises.createSet(ctx.auth!, body.exercises, body.status, ctx.requestId) };
  }

  @Post()
  @RequirePermissions("questoes.criar")
  create(@ZodBody(CreateExerciseRequestSchema) body: CreateExerciseRequest, @Ctx() ctx: RequestContext): Promise<ExerciseTeacherView> {
    return this.exercises.createOne(ctx.auth!, body, ctx.requestId);
  }

  /** One page of the teacher's bank; ARCHIVED only when filtered (US5-1). */
  @Get()
  @RequirePermissions("questoes.visualizar")
  list(@Query(new ZodValidationPipe(ExerciseListQuerySchema)) query: ExerciseListQuery, @Ctx() ctx: RequestContext): Promise<ExercisePage> {
    return this.exercises.list(ctx.auth!.userId, query);
  }

  @Get(":id")
  @RequirePermissions("questoes.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ExerciseTeacherView> {
    return this.exercises.get(ctx.auth!.userId, id);
  }

  @Put(":id")
  @RequirePermissions("questoes.editar")
  update(
    @Param("id", idPipe) id: string,
    @ZodBody(UpdateExerciseRequestSchema) body: UpdateExerciseRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ExerciseTeacherView> {
    return this.exercises.update(ctx.auth!, id, body, ctx.requestId);
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermissions("questoes.aprovar")
  approve(
    @Param("id", idPipe) id: string,
    @ZodBody(ExerciseVersionRequestSchema) body: ExerciseVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ExerciseTeacherView> {
    return this.exercises.approve(ctx.auth!, id, body.version, ctx.requestId);
  }

  /** DRAFT | APPROVED → ARCHIVED; already archived → 200 as it is (US5-4). */
  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermissions("questoes.editar")
  archive(
    @Param("id", idPipe) id: string,
    @ZodBody(ExerciseVersionRequestSchema) body: ExerciseVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ExerciseTeacherView> {
    return this.exercises.archive(ctx.auth!, id, body.version, ctx.requestId);
  }

  /** ARCHIVED → the status before archiving (US5-4). */
  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermissions("questoes.editar")
  restore(
    @Param("id", idPipe) id: string,
    @ZodBody(ExerciseVersionRequestSchema) body: ExerciseVersionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ExerciseTeacherView> {
    return this.exercises.restore(ctx.auth!, id, body.version, ctx.requestId);
  }

  /** Only a DRAFT of a batch (US4-3); 204. */
  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions("questoes.editar")
  async delete(@Param("id", idPipe) id: string, @ZodBody(ExerciseVersionRequestSchema) body: ExerciseVersionRequest, @Ctx() ctx: RequestContext): Promise<void> {
    await this.exercises.deleteDraft(ctx.auth!, id, body.version, ctx.requestId);
  }
}
