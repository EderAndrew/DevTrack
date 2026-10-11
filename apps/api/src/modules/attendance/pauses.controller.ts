import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { EmptyBodySchema, type TeacherPause, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { PausesService } from "./pauses.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's side of the room exits (016 contracts/http-api.md, "Teacher routes"); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId/pauses")
export class PausesController {
  constructor(private readonly pauses: PausesService) {}

  /** "Liberar retorno": idempotent, keyed by the pause (research M7). */
  @Post(":pauseId/release")
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
}
