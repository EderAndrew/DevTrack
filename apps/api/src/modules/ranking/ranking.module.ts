import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { ClassRankingController, MyRankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";

/**
 * The class ranking of practice points (013 research K11–K13): derived on every read from the
 * scoring results of `exercise_question_results` over the class's ACTIVE enrollments. It reads
 * neither bank nor AI. The student's and the teacher's routes are here; the dashboard block reaches
 * `RankingService` through the export.
 */
@Module({
  imports: [ClassesModule],
  controllers: [MyRankingController, ClassRankingController],
  providers: [RankingService],
  exports: [RankingService],
})
export class RankingModule {}
