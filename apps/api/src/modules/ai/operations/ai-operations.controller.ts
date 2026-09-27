import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  type AiAgentOperationsView,
  type AiHealth,
  type AiMetrics,
  type AiMetricsQuery,
  AiMetricsQuerySchema,
  type AiModelCatalogView,
  type AiModelConfigView,
  AiRegistryKeySchema,
  type AiTaskPolicyView,
  type ChangeAiAgentStatusRequest,
  ChangeAiAgentStatusRequestSchema,
  type ChangeAiModelConfigStatusRequest,
  ChangeAiModelConfigStatusRequestSchema,
} from "@repo/contracts";
import { Ctx, type RequestContext } from "../../../platform/http/request-context";
import { ZodBody, ZodValidationPipe } from "../../../platform/http/zod-validation.pipe";
import { RequirePermissions } from "../../access-control/decorators";
import { AiOperationsService } from "./ai-operations.service";

const keyPipe = new ZodValidationPipe(AiRegistryKeySchema);

/**
 * AI operations for the administrator (006 US7, contracts/http-api.md): health, aggregates,
 * agents and model configs, and the kill switches — never pedagogical content (FR-031).
 */
@Controller("ai/operations")
export class AiOperationsController {
  constructor(private readonly operations: AiOperationsService) {}

  @Get("health")
  @RequirePermissions("ia.operacao.visualizar")
  health(): Promise<AiHealth> {
    return this.operations.health();
  }

  @Get("metrics")
  @RequirePermissions("ia.operacao.visualizar")
  metrics(@Query(new ZodValidationPipe(AiMetricsQuerySchema)) query: AiMetricsQuery): Promise<AiMetrics> {
    return this.operations.metrics(query.period);
  }

  @Get("agents")
  @RequirePermissions("ia.operacao.visualizar")
  agents(): Promise<AiAgentOperationsView[]> {
    return this.operations.listAgents();
  }

  @Get("model-configs")
  @RequirePermissions("ia.operacao.visualizar")
  modelConfigs(): Promise<AiModelConfigView[]> {
    return this.operations.listModelConfigs();
  }

  @Get("models")
  @RequirePermissions("ia.operacao.visualizar")
  models(@Query(new ZodValidationPipe(AiMetricsQuerySchema)) query: AiMetricsQuery): Promise<AiModelCatalogView[]> {
    return this.operations.listModels(query.period);
  }

  @Get("tasks")
  @RequirePermissions("ia.operacao.visualizar")
  tasks(): Promise<AiTaskPolicyView[]> {
    return this.operations.listTasks();
  }

  @Post("agents/:key/status")
  @RequirePermissions("ia.agentes.gerenciar")
  @HttpCode(200)
  async changeAgentStatus(
    @Param("key", keyPipe) key: string,
    @ZodBody(ChangeAiAgentStatusRequestSchema) body: ChangeAiAgentStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<AiAgentOperationsView> {
    const { view } = await this.operations.changeAgentStatus({ userId: ctx.auth!.userId, requestId: ctx.requestId }, key, body.status);
    return view;
  }

  @Post("model-configs/:key/status")
  @RequirePermissions("ia.agentes.gerenciar")
  @HttpCode(200)
  changeModelConfigStatus(
    @Param("key", keyPipe) key: string,
    @ZodBody(ChangeAiModelConfigStatusRequestSchema) body: ChangeAiModelConfigStatusRequest,
    @Ctx() ctx: RequestContext,
  ): Promise<AiModelConfigView> {
    return this.operations.changeModelConfigStatus({ userId: ctx.auth!.userId, requestId: ctx.requestId }, key, body.status);
  }
}
