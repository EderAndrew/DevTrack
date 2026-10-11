import { Controller, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import { type AttemptPauses, EmptyBodySchema, type TeacherPause, UuidSchema } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { PausesService } from "./pauses.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's side of the room exits (016 contracts/http-api.md, "Teacher routes"); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId")
export class PausesController {
  constructor(private readonly pauses: PausesService) {}

  /** "Pausar aluno" (016/FR-016): 201 for a new pause; 200 with the pause already open. */
  @Post("students/:studentUserId/pause")
  @RequirePermissions("chamada.registrar")
  async pauseStudent(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("studentUserId", idPipe) studentUserId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TeacherPause> {
    const { pause, created } = await this.pauses.pauseStudent(ctx.auth!.userId, classId, activityId, studentUserId, ctx.requestId);
    res.status(created ? 201 : 200);
    return pause;
  }

  /** "Liberar retorno": idempotent, keyed by the pause (research M7). */
  @Post("pauses/:pauseId/release")
  @HttpCode(200)
  @RequirePermissions("chamada.registrar")
  release(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("pauseId", idPipe) pauseId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherPause> {
    return this.pauses.release(ctx.auth!.userId, classId, activityId, pauseId, ctx.requestId);
  }

  /** "Saídas da sala" in the review (016/FR-021): an attempt's pauses with their derived durations. */
  @Get("attempts/:attemptId/pauses")
  @RequirePermissions("entregas.visualizar")
  forAttempt(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<AttemptPauses> {
    return this.pauses.forAttempt(ctx.auth!.userId, classId, activityId, attemptId);
  }
}
