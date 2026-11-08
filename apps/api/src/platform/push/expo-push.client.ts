import {
  PUSH_RECEIPTS_BATCH,
  PUSH_SEND_BATCH,
  PushClient,
  type PushMessage,
  type PushReceipt,
  type PushTicket,
  PushTransientError,
  safeErrorCode,
} from "./push-client";

/** Expo Push's origin, the default of `EXPO_PUSH_BASE_URL` (contracts/configuration.md). */
export const EXPO_PUSH_ORIGIN = "https://exp.host";

/** A request to Expo never holds the alert worker longer than this. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface ExpoPushOptions {
  /** `https://exp.host` (only the test harness points elsewhere, contracts/configuration.md). */
  baseUrl: string;
  /** The Expo project's access token; never logged or put in an error. */
  accessToken: string | null;
  /** Injected by the unit test. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface ExpoAnswer {
  status?: unknown;
  id?: unknown;
  details?: { error?: unknown } | null;
}

/** Expo refused the whole request (4xx other than 429): not worth a retry. Carries the status only. */
export class PushRequestRefused extends Error {
  constructor(readonly status: number) {
    super(`push request refused: ${status}`);
    this.name = "PushRequestRefused";
  }
}

/**
 * Expo Push over `fetch` (024 research Y6): `POST /--/api/v2/push/send` and `/getReceipts`, authenticated
 * with the project's access token (Expo's enhanced push security: a leaked device token alone can't be
 * pushed to). The only file of the API that knows Expo's host (`exam-alerts-boundary.spec.ts`); no SDK.
 * Tokens, titles and bodies never reach a log or an error; an error code is kept only when it is a code.
 */
export class ExpoPushClient extends PushClient {
  readonly #baseUrl: string;
  readonly #accessToken: string | null;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: ExpoPushOptions) {
    super();
    this.#baseUrl = new URL(options.baseUrl).origin;
    this.#accessToken = options.accessToken;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];
    if (messages.length > PUSH_SEND_BATCH) throw new Error(`ExpoPushClient.send: at most ${PUSH_SEND_BATCH} messages`);
    const answer = await this.post("/--/api/v2/push/send", messages);
    const tickets = Array.isArray(answer.data) ? (answer.data as ExpoAnswer[]) : null;
    if (!tickets || tickets.length !== messages.length) throw new PushTransientError("SERVER");
    return tickets.map((ticket): PushTicket =>
      ticket.status === "ok" && typeof ticket.id === "string"
        ? { ok: true, ticketId: ticket.id }
        : { ok: false, errorCode: safeErrorCode(ticket.details?.error) },
    );
  }

  async getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    const receipts = new Map<string, PushReceipt>();
    if (ticketIds.length === 0) return receipts;
    if (ticketIds.length > PUSH_RECEIPTS_BATCH) throw new Error(`ExpoPushClient.getReceipts: at most ${PUSH_RECEIPTS_BATCH} ids`);
    const answer = await this.post("/--/api/v2/push/getReceipts", { ids: ticketIds });
    const data = answer.data !== null && typeof answer.data === "object" && !Array.isArray(answer.data) ? (answer.data as Record<string, ExpoAnswer>) : {};
    for (const id of ticketIds) {
      const receipt = Object.hasOwn(data, id) ? data[id] : undefined;
      if (!receipt) continue;
      receipts.set(id, receipt.status === "ok" ? { ok: true } : { ok: false, errorCode: safeErrorCode(receipt.details?.error) });
    }
    return receipts;
  }

  private async post(path: string, body: unknown): Promise<{ data?: unknown }> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.#accessToken ? { Authorization: `Bearer ${this.#accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
        redirect: "error",
      });
    } catch (error) {
      throw new PushTransientError(error instanceof Error && error.name === "TimeoutError" ? "TIMEOUT" : "NETWORK");
    }
    if (response.status === 429) throw new PushTransientError("RATE_LIMITED");
    if (response.status >= 500) throw new PushTransientError("SERVER");
    if (!response.ok) throw new PushRequestRefused(response.status);
    try {
      const parsed: unknown = await response.json();
      return parsed !== null && typeof parsed === "object" ? (parsed as { data?: unknown }) : {};
    } catch {
      throw new PushTransientError("SERVER");
    }
  }
}
