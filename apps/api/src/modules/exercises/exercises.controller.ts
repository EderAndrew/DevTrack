import { Controller, Get, Param, Post } from "@nestjs/common";
import {
  type CreateExerciseRequest,
  CreateExerciseRequestSchema,
  type ExerciseSet,
  type ExerciseSetRequest,
  ExerciseSetRequestSchema,
  type ExerciseTeacherView,
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

  @Get(":id")
  @RequirePermissions("questoes.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ExerciseTeacherView> {
    return this.exercises.get(ctx.auth!.userId, id);
  }
}
