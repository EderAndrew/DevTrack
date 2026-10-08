import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AiModule } from "../ai/ai.module";
import { ClassesModule } from "../classes/classes.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { WorkHelpAvailability } from "./work-help-availability";
import { WorkHelpAvailabilityController } from "./work-help-availability.controller";
import { WorkHelpReviewController } from "./work-help-review.controller";
import { WorkHelpReviewService } from "./work-help-review.service";
import { WorkHelpController } from "./work-help.controller";
import { WorkHelpService } from "./work-help.service";

/**
 * The AI help of a work (015, research F1, F8–F11): the student's requests and reads, the teacher's
 * read, the `work-helper` definitions (registered through `productionAiDefinitions`), the leak check
 * and the materialization. It registers the `HelpAvailability` hook of `activities`, which never
 * imports it; the AI module never writes its data. The availability arrived with US1, the student's
 * routes with US3, the teacher's with US4.
 */
@Module({
  imports: [AiModule, ActivitiesModule, ClassesModule, StudentActivitiesModule],
  controllers: [WorkHelpAvailabilityController, WorkHelpController, WorkHelpReviewController],
  providers: [WorkHelpAvailability, WorkHelpService, WorkHelpReviewService],
})
export class WorkHelpModule {}
