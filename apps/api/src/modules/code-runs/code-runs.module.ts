import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module";
import { StudentActivitiesModule } from "../student-activities/student-activities.module";
import { RunnerAvailability } from "./availability";
import { CodeRunsController } from "./code-runs.controller";
import { CodeRunsService } from "./code-runs.service";

/**
 * The student's side of the Code Runner (019, research B15): the run routes, the availability read
 * from the workers' heartbeats (registered on the activities' `CodeRunAvailability` hook, so the
 * student view shows it without importing this module), the student view of a run and the
 * settlement of stale runs, with the pure `compare-output`, `verdict` and `run-state`. It never runs
 * code: only the worker (`src/code-runner`, a process of its own) talks to Docker, and nothing here
 * imports it. It never touches answers, attempts, grading, points or the ranking (FR-008).
 */
@Module({
  imports: [ActivitiesModule, StudentActivitiesModule],
  controllers: [CodeRunsController],
  providers: [CodeRunsService, RunnerAvailability],
})
export class CodeRunsModule {}
