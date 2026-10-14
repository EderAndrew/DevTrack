import { Controller, Get, Param } from "@nestjs/common";
import { type ExamMonitor, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExamMonitorService } from "./exam-monitor.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The teacher's exam monitor (018/FR-025, contracts/http-api.md); another teacher's class → 404, not an exam → 409. */
@Controller("classes/:classId/activities/:activityId/exam-monitor")
export class ExamMonitorController {
  constructor(private readonly monitor: ExamMonitorService) {}

  @Get()
  @RequirePermissions("chamada.registrar")
  get(@Param("classId", idPipe) classId: string, @Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<ExamMonitor> {
    return this.monitor.monitor(ctx.auth!.userId, classId, activityId);
  }
}
