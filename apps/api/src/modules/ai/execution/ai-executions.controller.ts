import { Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import {
  type AiExecutionListQuery,
  AiExecutionListQuerySchema,
  type AiExecutionPage,
  type AiExecutionResult,
  type AiExecutionView,
  EmptyBodySchema,
  type RequestAiExecutionRequest,
  RequestAiExecutionRequestSchema,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../../access-control/decorators";
import { AiExecutionsService } from "./ai-executions.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/**
 * The session teacher's AI executions (006 contracts/http-api.md). Requesting also needs the
 * agent's own permission, checked in the service; other teachers' executions are 404.
 */
@Controller("ai/executions")
export class AiExecutionsController {
  constructor(private readonly executions: AiExecutionsService) {}

  /** 202 for a new execution; 200 when the idempotency key returns an existing one. */
  @Post()
  @RequirePermissions("ia.execucoes.visualizar")
  async request(
    @ZodBody(RequestAiExecutionRequestSchema) body: RequestAiExecutionRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AiExecutionView> {
    const { view, created } = await this.executions.request(ctx.auth!, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return view;
  }

  @Get()
  @RequirePermissions("ia.execucoes.visualizar")
  list(@Query(new ZodValidationPipe(AiExecutionListQuerySchema)) query: AiExecutionListQuery, @Ctx() ctx: RequestContext): Promise<AiExecutionPage> {
    return this.executions.list(ctx.auth!.userId, query);
  }

  @Get(":id")
  @RequirePermissions("ia.execucoes.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<AiExecutionView> {
    return this.executions.get(ctx.auth!.userId, id);
  }

  @Get(":id/result")
  @RequirePermissions("ia.execucoes.visualizar")
  result(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<AiExecutionResult> {
    return this.executions.getResult(ctx.auth!.userId, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("ia.execucoes.visualizar")
  @HttpCode(200)
  cancel(@Param("id", idPipe) id: string, @ZodBody(EmptyBodySchema) _body: object, @Ctx() ctx: RequestContext): Promise<AiExecutionView> {
    return this.executions.cancel(ctx.auth!, id, ctx.requestId);
  }
}
