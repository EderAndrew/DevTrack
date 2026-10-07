import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";

/**
 * The controlled mode of a work (015, research F1, F4–F7): the student's integrity events, the
 * teacher's summary and timeline, the pure timeline and typing-allowance rules, and the
 * `AnswerSaveGuard` implementation it registers in `student-activities`, which never imports it.
 * Routes and the guard arrive with US2 and US4.
 */
@Module({
  imports: [ActivitiesModule, StudentActivitiesModule],
})
export class AttemptIntegrityModule {}
