import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  type RecordIntegrityEventsRequest,
  RecordIntegrityEventsRequestSchema,
  type RecordIntegrityEventsResult,
  type StudentIntegrity,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { FocusEventsService } from "./focus-events.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The controlled mode's student routes (015 contracts/http-api.md, "Student routes"); identity from the session only. */
@Controller("me/activities/:activityId/attempt")
export class FocusEventsController {
  constructor(private readonly events: FocusEventsService) {}

  @Post("events")
  @HttpCode(200)
  @RequirePermissions("atividades.proprias.responder")
  record(
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(RecordIntegrityEventsRequestSchema) body: RecordIntegrityEventsRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<RecordIntegrityEventsResult> {
    return this.events.record(ctx.auth!.userId, activityId, body, ctx.requestId);
  }

  @Get("integrity")
  @RequirePermissions("atividades.proprias.visualizar")
  own(@Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<StudentIntegrity> {
    return this.events.own(ctx.auth!.userId, activityId, ctx.requestId);
  }
}
