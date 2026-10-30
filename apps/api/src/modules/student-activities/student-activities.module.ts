import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { RankingModule } from "../ranking/ranking.module";
import { AnswerSaveGuard } from "./answer-save-guard";
import { AttemptsController, ExerciseAttemptsController } from "./attempts.controller";
import { AttemptsService } from "./attempts.service";
import { GroupWorkController } from "./group-work.controller";
import { GroupWorkService } from "./group-work.service";
import { MyActivitiesController } from "./my-activities.controller";
import { MyActivitiesService } from "./my-activities.service";
import { StudentActivityLoader } from "./student-activity-loader";

/**
 * The student portal (012, research P1): dashboard, "Minhas atividades", the attempt with its
 * answers and the submission, from the session user's ACTIVE enrollments only (research P18). Its
 * responses come only from `activities/views/student-view.ts`. Since 013 an
 * EXERCISE is practiced in numbered attempts: retry, conclusion and the concluded attempt. Since 015
 * it exports the `AnswerSaveGuard` hook that `attempt-integrity` registers and the
 * `StudentActivityLoader` the 015 student routes start from (research F1). Since 023 a group work's
 * routes (`group-work.*`): the candidates now, the inclusion and the editing with the later stories.
 */
@Module({
  imports: [ActivitiesModule, RankingModule],
  controllers: [MyActivitiesController, AttemptsController, ExerciseAttemptsController, GroupWorkController],
  providers: [StudentActivityLoader, MyActivitiesService, AttemptsService, AnswerSaveGuard, GroupWorkService],
  exports: [AnswerSaveGuard, StudentActivityLoader],
})
export class StudentActivitiesModule {}
