import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type AdminFeedback,
  type AdminFeedbackPage,
  type ChangeFeedbackStatusRequest,
  ChangeFeedbackStatusRequestSchema,
  type FeedbackSummary,
  type ListAdminFeedbacksQuery,
  ListAdminFeedbacksQuerySchema,
  UuidSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { AdminFeedbackService } from "./admin-feedback.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** The ADMIN's feedback routes, `/feedbacks` (020 contracts/http-api.md): no route edits or deletes a message (FR-012). */
@Controller("feedbacks")
export class AdminFeedbackController {
  constructor(private readonly feedbacks: AdminFeedbackService) {}

  @Get()
  @RequirePermissions("feedbacks.visualizar")
  list(@Query(new ZodValidationPipe(ListAdminFeedbacksQuerySchema)) query: ListAdminFeedbacksQuery): Promise<AdminFeedbackPage> {
    return this.feedbacks.list(query);
  }

  @Get("summary")
  @RequirePermissions("feedbacks.visualizar")
  summary(): Promise<FeedbackSummary> {
    return this.feedbacks.summary();
  }

  @Get(":id")
  @RequirePermissions("feedbacks.visualizar")
  detail(@Param("id", idPipe) id: string): Promise<AdminFeedback> {
    return this.feedbacks.detail(id);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermissions("feedbacks.alterar_situacao")
  changeStatus(
    @Param("id", idPipe) id: string,
    @ZodBody(ChangeFeedbackStatusRequestSchema) body: ChangeFeedbackStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<AdminFeedback> {
    return this.feedbacks.changeStatus(ctx.auth!.userId, id, body, ctx.requestId);
  }
}
