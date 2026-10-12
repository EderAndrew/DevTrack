import type { IncomingHttpHeaders } from "node:http";

/**
 * What a provider says about one message, in our terms (017 research N7): delivered, bounced for
 * good, bounced for now (recorded only), marked as spam, refused by the provider, or an event we do
 * not use (opened, clicked, sent…), which is neither stored nor applied.
 */
export type NoticeKind = "DELIVERED" | "BOUNCED" | "TEMPORARY" | "COMPLAINED" | "REJECTED" | "IGNORED";

/** A notice whose signature checked, reduced to the fields we use. */
export interface VerifiedNotice {
  /** The provider's id of the notice (`svix-id`, SNS `MessageId`), the idempotency key (FR-012). */
  noticeId: string;
  kind: NoticeKind;
  /** The Message-ID we sent (research N5), null when the event carries none. */
  messageId: string | null;
  /** The provider's time of the event. */
  occurredAt: Date;
}

/** A verified request: a notice, or an SNS subscription confirmed (no notice to apply). */
export type AdapterResult = { type: "notice"; notice: VerifiedNotice } | { type: "confirmed" };

/** The request as it arrived: headers and the raw body, before any parsing. */
export interface RawNotice {
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** Why a notice was refused; only for the log `mail.notice_rejected`, never for the response. */
export type NoticeRejectReason = "SIGNATURE" | "TIMESTAMP" | "TOPIC" | "FORMAT";

export class NoticeRejected extends Error {
  constructor(readonly reason: NoticeRejectReason) {
    super(`notice rejected (${reason})`);
    this.name = "NoticeRejected";
  }
}

/** One provider's notices (research N6): verifies the raw request, then maps it (N7). */
export interface NoticeAdapter {
  verify(raw: RawNotice, now: Date): Promise<AdapterResult>;
}

/** The longest provider notice id we keep (`mail_notices.notice_id`, data-model). */
export const NOTICE_ID_MAX = 200;

/** `<{deliveryId}.{attempt}@{domain}>` (research N5), with or without the angle brackets. */
const MESSAGE_ID = /^<?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([1-9]\d?)@([^<>@\s]{1,253})>?$/i;

export interface MessageIdRef {
  deliveryId: string;
  attempt: number;
  domain: string;
}

/** The delivery and attempt one of our Message-IDs names; null for anyone else's. */
export function parseMessageId(messageId: string | null): MessageIdRef | null {
  const match = messageId ? MESSAGE_ID.exec(messageId.trim()) : null;
  if (!match) return null;
  return { deliveryId: match[1]!.toLowerCase(), attempt: Number(match[2]), domain: match[3]!.toLowerCase() };
}

/** One request header as a single string (the first, if repeated). */
export function headerOf(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
