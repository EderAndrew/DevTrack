import { Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import {
  UuidSchema,
  type WorkGenerationAvailability,
  type WorkGenerationRequest,
  type WorkGenerationRequestListQuery,
  WorkGenerationRequestListQuerySchema,
  type WorkGenerationRequestPage,
  WorkGenerationRequestSchema,
  type WorkGenerationRequestView,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { WorkGenerationRequestsService } from "./work-generation-requests.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** "Criar trabalho com IA" (011 contracts/http-api.md, "Generation"); other teachers' requests are 404. */
@Controller()
export class WorkGenerationRequestsController {
  constructor(private readonly requests: WorkGenerationRequestsService) {}

  @Get("work-generation/availability")
  @RequirePermissions("ia.trabalhos.gerar", "ia.execucoes.visualizar")
  availability(): Promise<WorkGenerationAvailability> {
    return this.requests.availability();
  }

  /** 202 for a new request; 200 when the same key and body return the existing one. */
  @Post("work-generation-requests")
  @RequirePermissions("ia.trabalhos.gerar", "ia.execucoes.visualizar")
  async request(
    @ZodBody(WorkGenerationRequestSchema) body: WorkGenerationRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WorkGenerationRequestView> {
    const { view, created } = await this.requests.request(ctx.auth!, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return view;
  }

  @Get("work-generation-requests")
  @RequirePermissions("trabalhos.visualizar")
  list(
    @Query(new ZodValidationPipe(WorkGenerationRequestListQuerySchema)) query: WorkGenerationRequestListQuery,
    @Ctx() ctx: RequestContext,
  ): Promise<WorkGenerationRequestPage> {
    return this.requests.list(ctx.auth!.userId, query);
  }

  @Get("work-generation-requests/:id")
  @RequirePermissions("trabalhos.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<WorkGenerationRequestView> {
    return this.requests.get(ctx.auth!.userId, id);
  }
}
