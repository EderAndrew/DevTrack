import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { MyActivitiesController } from "./my-activities.controller";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

/**
 * The student portal (012, research P1): dashboard, "Minhas atividades", the attempt with its
 * answers and the submission, from the session user's ACTIVE enrollments only (research P18). Its
 * responses come only from `activities/views/student-view.ts`. The attempt routes arrive with US3 and US4.
 */
@Module({
  imports: [ActivitiesModule],
  controllers: [MyActivitiesController],
  providers: [StudentActivityLoader, MyActivitiesService],
})
export class StudentActivitiesModule {}
