import { Controller, Get, Param } from "@nestjs/common";
import { type TeacherHelpState, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { WorkHelpReviewService } from "./work-help-review.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The AI help of one attempt, teacher side (015 contracts/http-api.md); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId/attempts/:attemptId/help")
export class WorkHelpReviewController {
  constructor(private readonly review: WorkHelpReviewService) {}

  @Get()
  @RequirePermissions("entregas.visualizar")
  get(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherHelpState> {
    return this.review.forTeacher(ctx.auth!.userId, classId, activityId, attemptId);
  }
}
