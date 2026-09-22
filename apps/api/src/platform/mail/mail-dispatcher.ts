import { Injectable, Logger } from "@nestjs/common";
import { type MailMessage, Mailer } from "./mailer";

/**
 * Sends mail after the transaction has committed and outside the response path (R11, R16):
 * the HTTP response never waits on SMTP, so latency does not reveal whether an e-mail exists.
 * Failures are logged without the message content (which carries single-use links).
 */
@Injectable()
export class MailDispatcher {
  private readonly logger = new Logger(MailDispatcher.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly mailer: Mailer) {}

  /** Call only after the transaction that produced the message has committed. */
  afterCommit(fn: () => Promise<void>): void {
    const task = new Promise<void>((resolve) => setImmediate(resolve))
      .then(fn)
      .catch((error: unknown) => {
        this.logger.warn({ errorName: error instanceof Error ? error.name : "unknown" }, "Mail delivery failed");
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  send(message: MailMessage): void {
    const { template } = message;
    this.afterCommit(async () => {
      try {
        await this.mailer.send(message);
      } catch (error) {
        this.logger.warn({ template, errorName: error instanceof Error ? error.name : "unknown" }, "Mail delivery failed");
      }
    });
  }

  /** Waits for queued deliveries (tests and graceful shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }
}
