import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import {
  type CreateFeedbackRequest,
  CreateFeedbackRequestSchema,
  type ListMyFeedbacksQuery,
  ListMyFeedbacksQuerySchema,
  type StudentFeedback,
  type StudentFeedbackPage,
} from "@repo/contracts";
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

  /** "Meus feedbacks": only the session student's, newest first, 50 per page. */
  @Get()
  @RequirePermissions("feedbacks.proprios.listar")
  listMine(@Query(new ZodValidationPipe(ListMyFeedbacksQuerySchema)) query: ListMyFeedbacksQuery, @Ctx() ctx: RequestContext): Promise<StudentFeedbackPage> {
    return this.feedbacks.listMine(ctx.auth!.userId, query.cursor);
  }
}
