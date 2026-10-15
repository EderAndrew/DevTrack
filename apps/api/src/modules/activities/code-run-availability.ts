import { Injectable } from "@nestjs/common";
import type { ExecutionKey, QuestionExecution } from "@repo/contracts";

/** What decides a CODE question's execution: its language's profile key and its PUBLIC case count. */
export interface ExecutionQuestion {
  execution: ExecutionKey | null;
  publicCaseCount: number;
}

/** The execution of each EXERCISE CODE question at one instant (019 research B17). */
export type ExecutionOf = (question: ExecutionQuestion) => QuestionExecution;

export type ExecutionAvailabilityCheck = (now: Date) => Promise<ExecutionOf>;

/**
 * The activities' extension point for the Code Runner (019 research B15, like 015's
 * `HelpAvailability`): the student view asks it once per read for the execution of its EXERCISE CODE
 * questions, and `code-runs`, which `activities` never imports, registers the check at startup (the
 * kill switch and the workers' heartbeats). Without a registration no question shows an execution.
 */
@Injectable()
export class CodeRunAvailability {
  private checkFn: ExecutionAvailabilityCheck | null = null;

  register(check: ExecutionAvailabilityCheck): void {
    this.checkFn = check;
  }

  /** Null when nothing is registered: every question's `execution` is then null. */
  at(now: Date): Promise<ExecutionOf | null> {
    return this.checkFn ? this.checkFn(now) : Promise.resolve(null);
  }
}
