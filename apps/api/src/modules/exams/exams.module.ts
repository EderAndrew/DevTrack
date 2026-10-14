import { Module } from "@nestjs/common";
import { ExamReview } from "./exam-review";
import { ExamTopics } from "./exam-topics";
import { ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";

/**
 * The teacher's Banco de Provas (018 research T1, T2): a third private bank, apart from the exercise
 * (010) and work (011) banks. It mirrors `works` and imports only the work bank's pure parts
 * (`works/types`, `works/grading`, `works/grade`; `exams-boundary.spec.ts`), never AI code: `exam-ai`
 * hears about a generated exam's review through `ExamReview`. The pure
 * `coverage.ts` serves the 012 scope check of an exam.
 */
@Module({
  controllers: [ExamsController],
  providers: [ExamsService, ExamTopics, ExamReview],
  exports: [ExamsService, ExamTopics, ExamReview],
})
export class ExamsModule {}
