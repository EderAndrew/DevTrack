import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { ClassesModule } from "../classes/classes.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { ControlledAnswerGuard } from "./controlled-answer-guard";
import { FocusEventsController } from "./focus-events.controller";
import { FocusEventsService } from "./focus-events.service";
import { IntegrityReviewController } from "./integrity-review.controller";
import { IntegrityReviewService } from "./integrity-review.service";

/**
 * The controlled mode of a work (015, research F1, F4–F7): the student's integrity events, the
 * teacher's summary and timeline, the pure timeline and typing-allowance rules, and the
 * `AnswerSaveGuard` implementation it registers in `student-activities`, which never imports it.
 * The student's routes and the guard arrived with US2, the teacher's with US4.
 */
@Module({
  imports: [ActivitiesModule, ClassesModule, StudentActivitiesModule],
  controllers: [FocusEventsController, IntegrityReviewController],
  providers: [FocusEventsService, IntegrityReviewService, ControlledAnswerGuard],
})
export class AttemptIntegrityModule {}
