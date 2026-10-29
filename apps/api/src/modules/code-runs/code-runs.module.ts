import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { ClassesModule } from "../classes/classes.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { RunnerAvailability } from "./availability";
import { CodeRunnerAvailabilityController } from "./availability.controller";
import { CodeRunReviewController } from "./code-run-review.controller";
import { CodeRunReviewService } from "./code-run-review.service";
import { CodeRunsController } from "./code-runs.controller";
import { CodeRunsService } from "./code-runs.service";
import { CodeRunContentJob } from "./content-retention.job";

/**
 * The student's side of the Code Runner (019, research B15): the run routes, the availability read
 * from the workers' heartbeats (registered on the activities' `CodeRunAvailability` hook, so the
 * student view shows it without importing this module), the student view of a run, the
 * settlement of stale runs and the maintenance job `code-run-content` (FR-019), with the pure
 * `compare-output`, `verdict` and `run-state`. Since 021 also the teacher's summary of an attempt's
 * runs in a work (`code-run-review`, research Y7), ids, enums, counts and times only. It never runs code: only the worker (`src/code-runner`, a process of its own) talks to Docker, and nothing here
 * imports it. It never touches answers, attempts, grading, points or the ranking (FR-008).
 */
@Module({
  imports: [ActivitiesModule, ClassesModule, StudentActivitiesModule],
  controllers: [CodeRunsController, CodeRunnerAvailabilityController, CodeRunReviewController],
  providers: [CodeRunsService, CodeRunReviewService, RunnerAvailability, CodeRunContentJob],
})
export class CodeRunsModule {}
