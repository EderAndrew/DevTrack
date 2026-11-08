import {
  PushClient,
  type PushMessage,
  type PushReceipt,
  type PushTicket,
  PushTransientError,
} from "../../../src/platform/push/push-client";

type TicketStep = PushTicket | "transient" | "throw";

/**
 * Stands in for Expo in every test (024 research Y13): records what the worker sends and answers a
 * programmable queue — a ticket per message (`ok` by default), `transient` (a network/429/5xx failure,
 * the whole request) or `throw` (an unexpected error). Receipts are set per ticket id.
 */
export class FakePushClient extends PushClient {
  /** Every message the worker sent, in order. */
  readonly sent: PushMessage[] = [];
  /** Every receipt query, in order. */
  readonly receiptQueries: string[][] = [];
  /** Every request fails this way until set back to null (an outage longer than the retries). */
  failing: "transient" | "throw" | null = null;
  private readonly steps: TicketStep[] = [];
  private readonly receipts = new Map<string, PushReceipt>();
  private next = 0;

  /** The answers of the next messages (or requests, for `transient`/`throw`), in order. */
  script(...steps: TicketStep[]): void {
    this.steps.push(...steps);
  }

  /** Expo's receipt for a ticket. */
  receipt(ticketId: string, receipt: PushReceipt): void {
    this.receipts.set(ticketId, receipt);
  }

  reset(): void {
    this.sent.length = 0;
    this.receiptQueries.length = 0;
    this.steps.length = 0;
    this.receipts.clear();
    this.failing = null;
  }

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (this.failing === "transient") throw new PushTransientError("NETWORK");
    if (this.failing === "throw") throw new Error("fake push failure");
    const head = this.steps[0];
    if (head === "transient") {
      this.steps.shift();
      throw new PushTransientError("SERVER");
    }
    if (head === "throw") {
      this.steps.shift();
      throw new Error("fake push failure");
    }
    this.sent.push(...messages);
    return messages.map(() => {
      const step = this.steps[0];
      if (step && typeof step === "object") {
        this.steps.shift();
        return step;
      }
      this.next += 1;
      return { ok: true, ticketId: `ticket-${this.next}` };
    });
  }

  async getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    this.receiptQueries.push([...ticketIds]);
    return new Map(ticketIds.flatMap((id) => (this.receipts.has(id) ? [[id, this.receipts.get(id)!] as const] : [])));
  }
}
