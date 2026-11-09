import { Controller, Param, Post, Res } from "@nestjs/common";
import { type SendExamNudgeRequest, SendExamNudgeRequestSchema, type SendExamNudgeResponse, UuidSchema } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { MobileOnly, RequirePermissions } from "../access-control/decorators";
import { ExamNudgesService } from "./exam-nudges.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The app's bell (025/US1, contracts/http-api.md): only from a MOBILE session (`@MobileOnly()`, a web session is
 * `403 MOBILE_SESSION_REQUIRED`); the body is exactly `{}`. 201 for a new warning, 200 with the pending one.
 */
@Controller("classes/:classId/activities/:activityId/attempts/:attemptId/exam-nudges")
export class TeacherExamNudgesController {
  constructor(private readonly nudges: ExamNudgesService) {}

  @Post()
  @RequirePermissions("chamada.registrar", "provas.avisos.enviar")
  @MobileOnly()
  async send(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @ZodBody(SendExamNudgeRequestSchema) _body: SendExamNudgeRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SendExamNudgeResponse> {
    const { nudge, created } = await this.nudges.send(ctx.auth!.userId, classId, activityId, attemptId, ctx.requestId);
    res.status(created ? 201 : 200);
    return { nudge };
  }
}
