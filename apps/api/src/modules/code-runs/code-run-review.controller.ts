import { Controller, Get, Param } from "@nestjs/common";
import { type AttemptCodeRunSummary, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { CodeRunReviewService } from "./code-run-review.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The runs of one attempt, teacher side (021 contracts/http-api.md); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId/attempts/:attemptId/code-runs")
export class CodeRunReviewController {
  constructor(private readonly review: CodeRunReviewService) {}

  @Get()
  @RequirePermissions("entregas.visualizar")
  get(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<AttemptCodeRunSummary> {
    return this.review.forTeacher(ctx.auth!.userId, classId, activityId, attemptId);
  }
}
