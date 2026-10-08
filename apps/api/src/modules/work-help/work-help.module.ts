import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { AiModule } from "../ai/ai.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { WorkHelpAvailability } from "./work-help-availability";
import { WorkHelpAvailabilityController } from "./work-help-availability.controller";

/**
 * The AI help of a work (015, research F1, F8–F11): the student's requests and reads, the teacher's
 * read, the `work-helper` definitions (registered through `productionAiDefinitions`), the leak check
 * and the materialization. It registers the `HelpAvailability` hook of `activities`, which never
 * imports it; the AI module never writes its data. The availability arrived with US1; the help
 * routes arrive with US3 and US4.
 */
@Module({
  imports: [AiModule, ActivitiesModule, StudentActivitiesModule],
  controllers: [WorkHelpAvailabilityController],
  providers: [WorkHelpAvailability],
})
export class WorkHelpModule {}
