import { Injectable } from "@nestjs/common";

/**
 * AbortControllers of the executions this process is running (research A10). A cancellation
 * that lands on the same instance interrupts the model call right away; on another instance the
 * runner still sees `cancel_requested_at` at its next check.
 */
@Injectable()
export class AiExecutionAborts {
  private readonly controllers = new Map<string, AbortController>();

  register(executionId: string): AbortSignal {
    const controller = new AbortController();
    this.controllers.set(executionId, controller);
    return controller.signal;
  }

  abort(executionId: string): void {
    this.controllers.get(executionId)?.abort();
  }

  release(executionId: string): void {
    this.controllers.delete(executionId);
  }
}
