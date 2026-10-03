import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { AttemptsReviewController } from "./attempts-review.controller";
import { AttemptsReviewService } from "./attempts-review.service";

/**
 * Class activities (012, research P1): the snapshot of the teacher's banks applied to a class, its
 * lifecycle, the taught scope, the grading bridge to the 011 rules, the teacher and student views
 * and the derived statuses (pure, in `status/`). The teacher's routes live here (US1, US5); the
 * student's live in `student-activities`, which imports this module. Reads the bank tables through
 * Prisma with the teacher's filter and imports only the pure `works/grading` and `works/types`.
 */
@Module({
  imports: [ClassesModule],
  controllers: [ActivitiesController, AttemptsReviewController],
  providers: [ActivitiesService, AttemptsReviewService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
