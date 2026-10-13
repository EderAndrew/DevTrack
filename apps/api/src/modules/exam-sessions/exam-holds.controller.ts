import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { EmptyBodySchema, type TeacherExamHold, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExamHoldsService, type HoldDecision } from "./exam-holds.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The three decisions on a hold (018/FR-021–FR-023, contracts/http-api.md), keyed by the hold. */
@Controller("classes/:classId/activities/:activityId/exam-holds/:holdId")
export class ExamHoldsController {
  constructor(private readonly holds: ExamHoldsService) {}

  /** "Confirmar cancelamento": the submission CANCELLED with the teacher's zero. */
  @Post("cancel")
  @HttpCode(200)
  @RequirePermissions("provas.encerramentos.decidir")
  cancel(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("holdId", idPipe) holdId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherExamHold> {
    return this.decide(classId, activityId, holdId, "cancel", ctx);
  }

  /** "Devolver prova": only while the attempt has time and the activity is ACTIVE. */
  @Post("return")
  @HttpCode(200)
  @RequirePermissions("provas.encerramentos.decidir")
  return(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("holdId", idPipe) holdId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherExamHold> {
    return this.decide(classId, activityId, holdId, "return", ctx);
  }

  /** "Não cancelar": only once the attempt's end has come. */
  @Post("keep")
  @HttpCode(200)
  @RequirePermissions("provas.encerramentos.decidir")
  keep(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("holdId", idPipe) holdId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherExamHold> {
    return this.decide(classId, activityId, holdId, "keep", ctx);
  }

  private decide(classId: string, activityId: string, holdId: string, decision: HoldDecision, ctx: RequestContext): Promise<TeacherExamHold> {
    return this.holds.decide(ctx.auth!.userId, classId, activityId, holdId, decision, ctx.requestId);
  }
}
