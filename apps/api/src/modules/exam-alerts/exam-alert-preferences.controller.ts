import { Controller, Param, Put } from "@nestjs/common";
import { type ExamAlertPreference, type ExamAlertPreferenceRequest, ExamAlertPreferenceRequestSchema, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { MobileAccess, RequirePermissions } from "../access-control/decorators";
import { ExamAlertPreferencesService } from "./exam-alert-preferences.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** 024/US4: turn an exam's alerts off or on for all of the teacher's phones (contracts/http-api.md). */
@Controller("classes/:classId/activities/:activityId/exam-alerts")
export class ExamAlertPreferencesController {
  constructor(private readonly preferences: ExamAlertPreferencesService) {}

  @Put()
  @RequirePermissions("chamada.registrar")
  @MobileAccess()
  set(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(ExamAlertPreferenceRequestSchema) body: ExamAlertPreferenceRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<ExamAlertPreference> {
    return this.preferences.set(ctx.auth!.userId, classId, activityId, body.muted);
  }
}
