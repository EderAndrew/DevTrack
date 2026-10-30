import { Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import {
  EmptyBodySchema,
  type GradeSubmissionRequest,
  GradeSubmissionRequestSchema,
  type MarkExerciseResultsRequest,
  MarkExerciseResultsRequestSchema,
  type TeacherAttempt,
  type TeacherAttemptGroup,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AttemptsReviewService } from "./attempts-review.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** One student's attempt, teacher side (012 US5, 013 US3, contracts/http-api.md); another teacher's class → 404. */
@Controller("classes/:classId/activities/:activityId/attempts/:attemptId")
export class AttemptsReviewController {
  constructor(private readonly review: AttemptsReviewService) {}

  @Get()
  @RequirePermissions("entregas.visualizar")
  get(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherAttempt> {
    return this.review.getAttempt(ctx.auth!.userId, classId, activityId, attemptId);
  }

  /** 023/US6 — the group's members, editing handoffs and saves per question (FR-020); an individual attempt → 404. */
  @Get("group")
  @RequirePermissions("entregas.visualizar")
  group(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherAttemptGroup> {
    return this.review.getGroup(ctx.auth!.userId, classId, activityId, attemptId);
  }

  @Put("grades")
  @RequirePermissions("notas.lancar")
  grade(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @ZodBody(GradeSubmissionRequestSchema) body: GradeSubmissionRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherAttempt> {
    return this.review.grade(ctx.auth!, classId, activityId, attemptId, body, ctx.requestId);
  }

  /** 013 — an EXERCISE's open answers and code marked right or wrong (FR-017); no grade, no release. */
  @Put("marks")
  @RequirePermissions("exercicios.corrigir")
  mark(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @ZodBody(MarkExerciseResultsRequestSchema) body: MarkExerciseResultsRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherAttempt> {
    return this.review.mark(ctx.auth!, classId, activityId, attemptId, body, ctx.requestId);
  }

  /** The saved answers become a late submission (FR-006b); already submitted → 200 with the same one. */
  @Post("accept-submission")
  @HttpCode(200)
  @RequirePermissions("notas.lancar")
  acceptSubmission(
    @Param("classId", idPipe) classId: string,
    @Param("activityId", idPipe) activityId: string,
    @Param("attemptId", idPipe) attemptId: string,
    @ZodBody(EmptyBodySchema) _body: object,
    @Ctx() ctx: RequestContext,
  ): Promise<TeacherAttempt> {
    return this.review.acceptSubmission(ctx.auth!, classId, activityId, attemptId, ctx.requestId);
  }
}
