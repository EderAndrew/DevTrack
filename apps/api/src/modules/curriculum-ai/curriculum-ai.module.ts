import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { SyllabusModule } from "../syllabus/syllabus.module";

/**
 * Curriculum Agent (007): "Preencher com IA" on a syllabus document. It requests executions
 * through the AI foundation and applies an approved proposal into a 004 draft revision; the
 * AI module never writes syllabus data (research C1).
 */
@Module({
  imports: [AiModule, SyllabusModule],
})
export class CurriculumAiModule {}
