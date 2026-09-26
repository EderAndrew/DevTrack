import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { SyllabusModule } from "../syllabus/syllabus.module";
import { CurriculumAiRequestService } from "./curriculum-ai-request.service";
import { CurriculumAiController } from "./curriculum-ai.controller";

/**
 * Curriculum Agent (007): "Preencher com IA" on a syllabus document. It requests executions
 * through the AI foundation and applies an approved proposal into a 004 draft revision; the
 * AI module never writes syllabus data (research C1).
 */
@Module({
  imports: [AiModule, SyllabusModule],
  controllers: [CurriculumAiController],
  providers: [CurriculumAiRequestService],
})
export class CurriculumAiModule {}
