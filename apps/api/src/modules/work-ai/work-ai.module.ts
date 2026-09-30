import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { WorksModule } from "../works/works.module";
import { WorkGenerationRequestsController } from "./work-generation-requests.controller";
import { WorkGenerationRequestsService } from "./work-generation-requests.service";
import { WorkProposalCloser } from "./work-proposal-closer";

/**
 * Work generation with AI (011, research W1, W10): the request, the `work-generator` definitions
 * (registered through `productionAiDefinitions`) and the materialization of its DRAFT work. It
 * depends on the work bank; the bank never depends on it, and the AI module never writes work data.
 */
@Module({
  imports: [AiModule, WorksModule],
  controllers: [WorkGenerationRequestsController],
  providers: [WorkGenerationRequestsService, WorkProposalCloser],
})
export class WorkAiModule {}
