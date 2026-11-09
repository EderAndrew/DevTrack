import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { type DismissExamNudgeRequest, DismissExamNudgeRequestSchema, type StudentExamNudge, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExamNudgesService } from "./exam-nudges.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The student's side of the discreet warning (025/US2, contracts/http-api.md): the exam page's poll and "Entendi".
 * Web only (no `@MobileAccess()`); identity from the session, the body of the dismissal exactly `{}`.
 */
@Controller("me/activities/:activityId/attempt/exam-nudge")
export class StudentExamNudgeController {
  constructor(private readonly nudges: ExamNudgesService) {}

  @Get()
  @RequirePermissions("atividades.proprias.responder")
  pending(@Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<StudentExamNudge> {
    return this.nudges.studentPending(ctx.auth!.userId, activityId, ctx.requestId);
  }

  @Post(":nudgeId/dismiss")
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  dismiss(
    @Param("activityId", idPipe) activityId: string,
    @Param("nudgeId", idPipe) nudgeId: string,
    @ZodBody(DismissExamNudgeRequestSchema) _body: DismissExamNudgeRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<StudentExamNudge> {
    return this.nudges.dismiss(ctx.auth!.userId, activityId, nudgeId, ctx.requestId);
  }
}
