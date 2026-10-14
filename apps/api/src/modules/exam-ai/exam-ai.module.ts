import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { ExamsModule } from "../exams/exams.module";
import { ExamGenerationRequestsController } from "./exam-generation-requests.controller";
import { ExamGenerationRequestsService } from "./exam-generation-requests.service";
import { ExamProposalCloser } from "./exam-proposal-closer";

/**
 * "Criar prova com IA" (018 research T14): the `exam-generator` agent (DISABLED until the admin enables
 * it; registered through `productionAiDefinitions`), its generation requests and the materialization of
 * one DRAFT exam. It depends on the Banco de Provas; the bank never depends on it, and the AI module
 * never writes exam data. Like `work-ai`, it never names a tier, family or catalog key outside the task
 * declaration (`exams-boundary.spec.ts`).
 */
@Module({
  imports: [AiModule, ExamsModule],
  controllers: [ExamGenerationRequestsController],
  providers: [ExamGenerationRequestsService, ExamProposalCloser],
})
export class ExamAiModule {}
