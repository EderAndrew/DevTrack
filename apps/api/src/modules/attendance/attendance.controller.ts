import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { type AttendanceBatch, AttendanceBatchSchema, type Room, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AttendanceService } from "./attendance.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The attendance of a work (016 contracts/http-api.md, "Teacher routes"); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId/attendance")
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @RequirePermissions("chamada.registrar")
  room(@Param("classId", idPipe) classId: string, @Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<Room> {
    return this.attendance.room(ctx.auth!.userId, classId, activityId);
  }

  /** Marks (releases the work to) and unmarks students in one all-or-nothing batch (research M5). */
  @Post()
  @HttpCode(200)
  @RequirePermissions("chamada.registrar")
  apply(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @ZodBody(AttendanceBatchSchema) body: AttendanceBatch,
    @Ctx() ctx: RequestContext,
  ): Promise<Room> {
    return this.attendance.apply(ctx.auth!.userId, classId, activityId, body, ctx.requestId);
  }
}
