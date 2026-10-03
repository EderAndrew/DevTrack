import { Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  AttemptNumberSchema,
  EmptyBodySchema,
  type RetryAttemptRequest,
  RetryAttemptRequestSchema,
  type SaveAnswersRequest,
  SaveAnswersRequestSchema,
  type SaveAnswersResult,
  type StudentActivity,
  type StudentExerciseAttempt,
  type SubmitAttemptRequest,
  SubmitAttemptRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AttemptsService } from "./attempts.service";
import { MyActivitiesService } from "./my-activities.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The student's attempt (012 contracts/http-api.md, "Student routes"): start, save and submit; identity from the session only. */
@Controller("me/activities/:activityId/attempt")
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post()
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  start(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivity> {
    return this.attempts.start(ctx.auth!.userId, activityId, ctx.requestId);
  }

  @Put("answers")
  @RequirePermissions("atividades.proprias.responder")
  saveAnswers(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(SaveAnswersRequestSchema) body: SaveAnswersRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<SaveAnswersResult> {
    return this.attempts.saveAnswers(ctx.auth!.userId, activityId, body, ctx.requestId);
  }

  @Post("submit")
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  submit(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(SubmitAttemptRequestSchema) body: SubmitAttemptRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivity> {
    return this.attempts.submit(ctx.auth!.userId, activityId, body, ctx.requestId);
  }
}

const numberPipe = new ZodValidationPipe(AttemptNumberSchema);

/**
 * The practice attempts of an EXERCISE (013 contracts/http-api.md, research K4, K5, K10): "Refazer",
 * "Concluir exercícios" and a concluded attempt with its answer key; identity from the session only.
 */
@Controller("me/activities/:activityId/attempts")
export class ExerciseAttemptsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly myActivities: MyActivitiesService,
  ) {}

  @Post()
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  retry(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(RetryAttemptRequestSchema) body: RetryAttemptRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivity> {
    return this.attempts.retry(ctx.auth!.userId, activityId, body.afterNumber, ctx.requestId);
  }

  @Post(":number/complete")
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  complete(
    @Param("activityId", idPipe) activityId: string,
    @Param("number", numberPipe) number: number,
    @ZodBody(SubmitAttemptRequestSchema) body: SubmitAttemptRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentActivity> {
    return this.attempts.complete(ctx.auth!.userId, activityId, number, body, ctx.requestId);
  }

  @Get(":number")
  @RequirePermissions("atividades.proprias.visualizar")
  get(
    @Param("activityId", idPipe) activityId: string,
    @Param("number", numberPipe) number: number,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentExerciseAttempt> {
    return this.myActivities.getAttempt(ctx.auth!.userId, activityId, number, ctx.requestId);
  }
}
