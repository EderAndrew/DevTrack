import { Module } from "@nestjs/common";
import { ClassesModule } from "../classes/classes.module";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { CodeRunAvailability } from "./code-run-availability";
import { AttemptsReviewController } from "./attempts-review.controller";
import { AttemptsReviewService } from "./attempts-review.service";
import { ExamSettlement } from "./exam-settlement";
import { GroupSettlement } from "./group-settlement";
import { HelpAvailability } from "./help-availability";

/**
 * Class activities (012, research P1): the snapshot of the teacher's banks applied to a class, its
 * lifecycle, the taught scope, the grading bridge to the 011 rules, the teacher and student views
 * and the derived statuses (pure, in `status/`). The teacher's routes live here (US1, US5); the
 * student's live in `student-activities`, which imports this module. Reads the bank tables through
 * Prisma with the teacher's filter and imports only the pure `works/grading` and `works/types`.
 * Since 015 it exports the `HelpAvailability` hook that `work-help` registers (research F1), and since
 * 018 the `ExamSettlement` every touch of an exam attempt goes through first (research T5), and since
 * 019 the `CodeRunAvailability` hook that `code-runs` registers (research B15), and since 023 the
 * `GroupSettlement` every touch of a group attempt goes through first (research U9).
 */
@Module({
  imports: [ClassesModule],
  controllers: [ActivitiesController, AttemptsReviewController],
  providers: [ActivitiesService, AttemptsReviewService, HelpAvailability, ExamSettlement, CodeRunAvailability, GroupSettlement],
  exports: [ActivitiesService, HelpAvailability, ExamSettlement, CodeRunAvailability, GroupSettlement],
})
export class ActivitiesModule {}
