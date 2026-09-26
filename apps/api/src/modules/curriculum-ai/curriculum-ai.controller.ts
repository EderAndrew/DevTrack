import { Controller, Get, Param, Post, Res } from "@nestjs/common";
import {
  type CurriculumAiStatus,
  type RequestCurriculumAnalysisRequest,
  RequestCurriculumAnalysisRequestSchema,
  type RequestCurriculumAnalysisResponse,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { CurriculumAiRequestService } from "./curriculum-ai-request.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** "Preencher com IA" on a syllabus document (007 contracts/http-api.md). */
@Controller("syllabus-documents/:id")
export class CurriculumAiController {
  constructor(private readonly requests: CurriculumAiRequestService) {}

  @Get("ai")
  @RequirePermissions("ementas.visualizar", "ia.execucoes.visualizar")
  status(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<CurriculumAiStatus> {
    return this.requests.status(ctx.auth!, id);
  }

  /** 202 for a new execution; 200 when an active one already existed (research C13). */
  @Post("ai-analyses")
  @RequirePermissions("ementas.revisar", "ia.execucoes.visualizar")
  async request(
    @Param("id", idPipe) id: string,
    @ZodBody(RequestCurriculumAnalysisRequestSchema) body: RequestCurriculumAnalysisRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RequestCurriculumAnalysisResponse> {
    const result = await this.requests.request(ctx.auth!, id, body, ctx.requestId);
    res.status(result.created ? 202 : 200);
    return result;
  }
}
