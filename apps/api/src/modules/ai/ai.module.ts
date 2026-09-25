import { Module } from "@nestjs/common";
import { PRODUCTION_AI_DEFINITIONS } from "./definitions";
import { AI_DEFINITIONS } from "./definitions/types";
import { AiExecutionAborts } from "./execution/ai-execution-aborts";
import { AiExecutionRunner } from "./execution/ai-execution.runner";
import { AiExecutionStore } from "./execution/ai-execution.store";
import { AiExecutionWorker } from "./execution/ai-execution.worker";
import { AiExecutionsController } from "./execution/ai-executions.controller";
import { AiOperationsController } from "./operations/ai-operations.controller";
import { AiOperationsService } from "./operations/ai-operations.service";
import { AiProposalsController } from "./proposals/ai-proposals.controller";
import { AiProposalsService } from "./proposals/ai-proposals.service";
import { AiToolExecutor } from "./tools/ai-tool-executor";
import { AiResourceResolver } from "./execution/ai-resource.resolver";
import { AiExecutionsService } from "./execution/ai-executions.service";
import { ModelGateway } from "./gateway/model-gateway";
import { StructuredOutputValidator } from "./output/structured-output.validator";
import { AiAgentRegistry } from "./registry/ai-agent.registry";
import { AiModelConfigRegistry } from "./registry/ai-model-config.registry";
import { AiRegistrySync } from "./registry/ai-registry.sync";
import { AiToolRegistry } from "./registry/ai-tool.registry";
import { AiUsageRecorder } from "./usage/ai-usage.recorder";

/**
 * The AI foundation (spec 006): the only way to a model. Folders by responsibility
 * (research A3): definitions, registry, gateway, tools, output, execution, proposals, usage,
 * operations, evaluation and retention. Domain modules use `AiExecutionsService` only.
 */
@Module({
  controllers: [AiExecutionsController, AiProposalsController, AiOperationsController],
  providers: [
    { provide: AI_DEFINITIONS, useValue: PRODUCTION_AI_DEFINITIONS },
    AiRegistrySync,
    AiAgentRegistry,
    AiToolRegistry,
    AiModelConfigRegistry,
    ModelGateway,
    StructuredOutputValidator,
    AiUsageRecorder,
    AiExecutionStore,
    AiExecutionAborts,
    AiResourceResolver,
    AiToolExecutor,
    AiExecutionRunner,
    AiExecutionWorker,
    AiExecutionsService,
    AiProposalsService,
    AiOperationsService,
  ],
  exports: [AI_DEFINITIONS, AiExecutionsService, AiProposalsService],
})
export class AiModule {}
