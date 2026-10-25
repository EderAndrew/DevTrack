import { Body, Controller, Post, Res } from "@nestjs/common";
import { type CreateFeedbackRequest, CreateFeedbackRequestSchema, type StudentFeedback } from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { StudentFeedbackService } from "./student-feedback.service";

/** The student's feedback routes, `/me/feedbacks` (020 contracts/http-api.md); identity from the session only. */
@Controller("me/feedbacks")
export class StudentFeedbackController {
  constructor(private readonly feedbacks: StudentFeedbackService) {}

  /** 201 for a new feedback; 200 with the one already stored under the same `submissionId`. */
  @Post()
  @RequirePermissions("feedbacks.enviar")
  async create(
    @Body(new ZodValidationPipe(CreateFeedbackRequestSchema)) body: CreateFeedbackRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StudentFeedback> {
    const { feedback, created } = await this.feedbacks.create(ctx.auth!.userId, body, ctx.requestId);
    res.status(created ? 201 : 200);
    return feedback;
  }
}
