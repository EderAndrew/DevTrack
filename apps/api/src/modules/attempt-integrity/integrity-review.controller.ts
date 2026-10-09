import { Controller, Get, Param } from "@nestjs/common";
import { type IntegritySummaryList, type IntegrityTimeline, UuidSchema } from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { IntegrityReviewService } from "./integrity-review.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The controlled mode's teacher routes (015 contracts/http-api.md, "Teacher routes"); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId")
export class IntegrityReviewController {
  constructor(private readonly review: IntegrityReviewService) {}

  @Get("integrity")
  @RequirePermissions("entregas.visualizar")
  summary(@Param("classId", idPipe) classId: string, @Param("activityId", idPipe) activityId: string, @Ctx() ctx: RequestContext): Promise<IntegritySummaryList> {
    return this.review.summary(ctx.auth!.userId, classId, activityId);
  }

  @Get("attempts/:attemptId/integrity")
  @RequirePermissions("entregas.visualizar")
  timeline(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<IntegrityTimeline> {
    return this.review.timeline(ctx.auth!.userId, classId, activityId, attemptId);
  }
}
