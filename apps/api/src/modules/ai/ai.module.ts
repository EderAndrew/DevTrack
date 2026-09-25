import { Module } from "@nestjs/common";
import { PRODUCTION_AI_DEFINITIONS } from "./definitions";
import { AI_DEFINITIONS } from "./definitions/types";
import { ModelGateway } from "./gateway/model-gateway";
import { AiAgentRegistry } from "./registry/ai-agent.registry";
import { AiModelConfigRegistry } from "./registry/ai-model-config.registry";
import { AiRegistrySync } from "./registry/ai-registry.sync";
import { AiToolRegistry } from "./registry/ai-tool.registry";

/**
 * The AI foundation (spec 006): the only way to a model. Folders by responsibility
 * (research A3): definitions, registry, gateway, tools, output, execution, proposals, usage,
 * operations, evaluation and retention.
 */
@Module({
  providers: [
    { provide: AI_DEFINITIONS, useValue: PRODUCTION_AI_DEFINITIONS },
    AiRegistrySync,
    AiAgentRegistry,
    AiToolRegistry,
    AiModelConfigRegistry,
    ModelGateway,
  ],
  exports: [AI_DEFINITIONS],
})
export class AiModule {}
