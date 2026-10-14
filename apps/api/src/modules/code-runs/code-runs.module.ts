import { Module } from "@nestjs/common";

/**
 * The student's side of the Code Runner (019, research B15): the run routes, the availability read
 * from the workers' heartbeats, the student view of a run and the content retention job, with the
 * pure `compare-output`, `verdict` and `run-state`. It never runs code: only the worker
 * (`src/code-runner`, a process of its own) talks to Docker, and nothing here imports it. It never
 * touches answers, attempts, grading, points or the ranking (FR-008). The routes arrive with US1.
 */
@Module({})
export class CodeRunsModule {}
