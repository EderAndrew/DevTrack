import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { RankingModule } from "../ranking/ranking.module";
import { AttemptsController, ExerciseAttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";
import { MyActivitiesController } from "./my-activities.controller";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

/**
 * The student portal (012, research P1): dashboard, "Minhas atividades", the attempt with its
 * answers and the submission, from the session user's ACTIVE enrollments only (research P18). Its
 * responses come only from `activities/views/student-view.ts`. Since 013 an
 * EXERCISE is practiced in numbered attempts: retry, conclusion and the concluded attempt.
 */
@Module({
  imports: [ActivitiesModule, RankingModule],
  controllers: [MyActivitiesController, AttemptsController, ExerciseAttemptsController],
  providers: [StudentActivityLoader, MyActivitiesService, AttemptsService],
})
export class StudentActivitiesModule {}
