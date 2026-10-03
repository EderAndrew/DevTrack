import { Controller, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  EmptyBodySchema,
  type SaveAnswersRequest,
  SaveAnswersRequestSchema,
  type SaveAnswersResult,
  type StudentActivity,
  type SubmitAttemptRequest,
  SubmitAttemptRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AttemptsService } from "./attempts.service";

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
