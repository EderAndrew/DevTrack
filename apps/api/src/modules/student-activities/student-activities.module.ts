import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";
import { MyActivitiesController } from "./my-activities.controller";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

/**
 * The student portal (012, research P1): dashboard, "Minhas atividades", the attempt with its
 * answers and the submission, from the session user's ACTIVE enrollments only (research P18). Its
 * responses come only from `activities/views/student-view.ts`. Start and save arrive with US3, the submission with US4.
 */
@Module({
  imports: [ActivitiesModule],
  controllers: [MyActivitiesController, AttemptsController],
  providers: [StudentActivityLoader, MyActivitiesService, AttemptsService],
})
export class StudentActivitiesModule {}
