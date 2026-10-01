import type { CodeRunnerPort, CodeRunStatus } from "./strategy";

/**
 * The only `CodeRunnerPort` of 011 (research W20): nothing is executed, so every code question goes
 * to the teacher (`CODE_RUNNER_UNAVAILABLE`). The Code Runner spec provides the real one.
 */
export class UnavailableCodeRunner implements CodeRunnerPort {
  run(): Promise<{ status: CodeRunStatus }> {
    return Promise.resolve({ status: "UNAVAILABLE" });
  }
}
