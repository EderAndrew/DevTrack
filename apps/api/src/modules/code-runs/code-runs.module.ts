import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { RunnerAvailability } from "./availability";
import { CodeRunnerAvailabilityController } from "./availability.controller";
import { CodeRunsController } from "./code-runs.controller";
import { CodeRunsService } from "./code-runs.service";
import { CodeRunContentJob } from "./content-retention.job";

/**
 * The student's side of the Code Runner (019, research B15): the run routes, the availability read
 * from the workers' heartbeats (registered on the activities' `CodeRunAvailability` hook, so the
 * student view shows it without importing this module), the student view of a run, the
 * settlement of stale runs and the maintenance job `code-run-content` (FR-019), with the pure
 * `compare-output`, `verdict` and `run-state`. It never runs code: only the worker (`src/code-runner`, a process of its own) talks to Docker, and nothing here
 * imports it. It never touches answers, attempts, grading, points or the ranking (FR-008).
 */
@Module({
  imports: [ActivitiesModule, StudentActivitiesModule],
  controllers: [CodeRunsController, CodeRunnerAvailabilityController],
  providers: [CodeRunsService, RunnerAvailability, CodeRunContentJob],
})
export class CodeRunsModule {}
