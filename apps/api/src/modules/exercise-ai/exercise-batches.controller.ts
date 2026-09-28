import { Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import {
  type ExerciseBatchDetail,
  type ExerciseBatchListQuery,
  ExerciseBatchListQuerySchema,
  type ExerciseBatchPage,
  type ExerciseBatchRequest,
  ExerciseBatchRequestSchema,
  type ExerciseBatchView,
  type ExerciseGenerationAvailability,
  UuidSchema,
} from "@repo/contracts";
import type { Response } from "express";
import { Ctx, type RequestContext } from "../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../access-control/decorators";
import { ExerciseBatchesService } from "./exercise-batches.service";

const idPipe = new ZodValidationPipe(UuidSchema);

/** "Criar com IA" (010 contracts/http-api.md, "Generation batches"); other teachers' batches are 404. */
@Controller()
export class ExerciseBatchesController {
  constructor(private readonly batches: ExerciseBatchesService) {}

  @Get("exercise-generation/availability")
  @RequirePermissions("ia.exercicios.gerar", "ia.execucoes.visualizar")
  availability(): Promise<ExerciseGenerationAvailability> {
    return this.batches.availability();
  }

  /** 202 for a new batch; 200 when the same key and body return the existing one. */
  @Post("exercise-batches")
  @RequirePermissions("ia.exercicios.gerar", "ia.execucoes.visualizar")
  async request(
    @ZodBody(ExerciseBatchRequestSchema) body: ExerciseBatchRequest,
    @Ctx() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExerciseBatchView> {
    const { view, created } = await this.batches.request(ctx.auth!, body, ctx.requestId);
    res.status(created ? 202 : 200);
    return view;
  }

  @Get("exercise-batches")
  @RequirePermissions("questoes.visualizar")
  list(@Query(new ZodValidationPipe(ExerciseBatchListQuerySchema)) query: ExerciseBatchListQuery, @Ctx() ctx: RequestContext): Promise<ExerciseBatchPage> {
    return this.batches.list(ctx.auth!.userId, query);
  }

  @Get("exercise-batches/:id")
  @RequirePermissions("questoes.visualizar")
  get(@Param("id", idPipe) id: string, @Ctx() ctx: RequestContext): Promise<ExerciseBatchDetail> {
    return this.batches.get(ctx.auth!.userId, id);
  }
}
