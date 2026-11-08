/**
 * The port of push delivery (024 research Y6, contracts/push-notifications.md). The API speaks only to
 * this interface: `ExpoPushClient` is the one adapter (the only file that knows Expo's host), and the tests
 * use `FakePushClient`. A message carries the minimum of FR-016; the device token is never logged.
 */

export interface PushMessage {
  /** The device's Expo push token. */
  to: string;
  /** The Android channel the app created (`exam-occurrences`, `exam-holds`, research Y7). */
  channelId: string;
  title: string;
  body: string;
  /** Ids only (`ExamAlertPushData`), read by the app to open the room. */
  data: Record<string, string>;
  priority: "high";
  sound: "default";
}

/** One message's answer, in the order sent: Expo's ticket id, or the error's code (never its message). */
export type PushTicket = { ok: true; ticketId: string } | { ok: false; errorCode: string };

/** The delivery outcome Expo learned from FCM/APNs, by ticket id. */
export type PushReceipt = { ok: true } | { ok: false; errorCode: string };

/** A failure worth retrying while the alert is young (network, timeout, 429, 5xx). */
export class PushTransientError extends Error {
  constructor(readonly reason: "NETWORK" | "TIMEOUT" | "RATE_LIMITED" | "SERVER") {
    super(`push transient failure: ${reason}`);
    this.name = "PushTransientError";
  }
}

/** Expo's limits per request (research Y6). */
export const PUSH_SEND_BATCH = 100;
export const PUSH_RECEIPTS_BATCH = 300;

/** An error code safe to store (`exam_alert_deliveries.error_code`): a code, never a message. */
export function safeErrorCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) ? value : "UnknownError";
}

export abstract class PushClient {
  /** Sends up to `PUSH_SEND_BATCH` messages; one ticket per message, in order. */
  abstract send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
  /** Reads up to `PUSH_RECEIPTS_BATCH` receipts; ids Expo doesn't know yet are absent. */
  abstract getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>>;
}
