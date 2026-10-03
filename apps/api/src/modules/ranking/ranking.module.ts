import { Module } from "@nestjs/common";
import { MyRankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";

/**
 * The class ranking of practice points (013 research K11–K13): derived on every read from the
 * scoring results of `exercise_question_results` over the class's ACTIVE enrollments. It reads
 * neither bank nor AI. The student's route is here; the dashboard block reaches `RankingService`
 * through the export.
 */
@Module({
  controllers: [MyRankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
