import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import {
  type CreateExamGenerationRequest,
  CreateExamGenerationRequestSchema,
  type ExamGenerationAvailability,
  type ExamGenerationRequest,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExamGenerationRequestsService } from "./exam-generation-requests.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** "Criar prova com IA" (018 contracts/http-api.md); other teachers' requests are 404. */
@Controller()
export class ExamGenerationRequestsController {
  constructor(private readonly requests: ExamGenerationRequestsService) {}

  @Get("exam-generation/availability")
  @RequirePermissions("ia.provas.gerar", "ia.execucoes.visualizar")
  availability(): Promise<ExamGenerationAvailability> {
    return this.requests.availability();
  }

  /** 202 for a new request; 200 when the same key and body return the existing one. */
  @Post("exam-generation-requests")
  @RequirePermissions("ia.provas.gerar", "ia.execucoes.visualizar")
  async request(
    @ZodBody(CreateExamGenerationRequestSchema) body: CreateExamGenerationRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExamGenerationRequest> {
    const { view, created } = await this.requests.request(ctx.auth!, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return view;
  }

  @Get("exam-generation-requests/:id")
  @RequirePermissions("ia.provas.gerar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ExamGenerationRequest> {
    return this.requests.get(ctx.auth!.userId, id);
  }
}
