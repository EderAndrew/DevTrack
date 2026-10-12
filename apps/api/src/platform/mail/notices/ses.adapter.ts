import { createVerify, X509Certificate } from "node:crypto";
import { z } from "zod";
import type { CertificateFetcher } from "./certificate-fetcher";
import { isSnsUrl } from "./certificate-fetcher";
import { type AdapterResult, NOTICE_ID_MAX, type NoticeAdapter, type NoticeKind, NoticeRejected, type RawNotice } from "./notice";

const text = (max: number) => z.string().min(1).max(max);
const isoTime = z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value)));

/** The SNS envelope (research N6), strict on the fields that are signed or used. */
const SnsEnvelopeSchema = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation"]),
  MessageId: text(NOTICE_ID_MAX),
  TopicArn: text(1_024),
  Message: z.string().max(256 * 1024),
  Timestamp: isoTime,
  SignatureVersion: text(8),
  Signature: text(4_096),
  SigningCertURL: text(2_048),
  Subject: z.string().max(1_024).optional(),
  SubscribeURL: z.string().max(2_048).optional(),
  Token: z.string().max(2_048).optional(),
});

type SnsEnvelope = z.infer<typeof SnsEnvelopeSchema>;

/**
 * The SES event inside an SNS `Notification`: identity notifications (`notificationType`) or a
 * configuration set's events (`eventType`). Only the type, the bounce type, the times and our
 * Message-ID (`mail.commonHeaders.messageId`, research N5) are read.
 */
const SesNotificationSchema = z.object({
  notificationType: z.string().max(64).optional(),
  eventType: z.string().max(64).optional(),
  mail: z.object({
    timestamp: isoTime.optional(),
    commonHeaders: z.object({ messageId: z.string().max(998).optional() }).optional(),
  }),
  bounce: z.object({ bounceType: z.string().max(64).optional(), timestamp: isoTime.optional() }).optional(),
  complaint: z.object({ timestamp: isoTime.optional() }).optional(),
  delivery: z.object({ timestamp: isoTime.optional() }).optional(),
});

type SesNotification = z.infer<typeof SesNotificationSchema>;

/** Research N7: SES events in our terms. */
function kindOf(event: SesNotification): NoticeKind {
  switch (event.notificationType ?? event.eventType) {
    case "Delivery":
      return "DELIVERED";
    case "Bounce":
      return event.bounce?.bounceType === "Permanent" ? "BOUNCED" : "TEMPORARY";
    case "Complaint":
      return "COMPLAINED";
    case "Reject":
      return "REJECTED";
    default:
      return "IGNORED";
  }
}

/** The string SNS signs (SNS "Verifying the signatures of Amazon SNS messages"), keys in this order. */
export function snsStringToSign(envelope: SnsEnvelope): string {
  const keys =
    envelope.Type === "Notification"
      ? ["Message", "MessageId", ...(envelope.Subject === undefined ? [] : ["Subject"]), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((key) => `${key}\n${envelope[key as keyof SnsEnvelope] ?? ""}\n`).join("");
}

/**
 * SES notices through SNS (research N6): `SignatureVersion` 2 only (SHA256withRSA), the certificate
 * from an SNS host over https, the topic equal to `MAIL_SES_TOPIC_ARN`. A `SubscriptionConfirmation`
 * of that topic, once verified, is confirmed through its `SubscribeURL` (same host rule).
 */
export class SesNoticeAdapter implements NoticeAdapter {
  constructor(
    private readonly topicArn: string,
    private readonly fetcher: CertificateFetcher,
  ) {}

  async verify(raw: RawNotice, _now: Date): Promise<AdapterResult> {
    const envelope = parse(SnsEnvelopeSchema, raw.body.toString("utf8"));
    if (envelope.SignatureVersion !== "2" || !isSnsUrl(envelope.SigningCertURL)) throw new NoticeRejected("SIGNATURE");
    if (envelope.TopicArn !== this.topicArn) throw new NoticeRejected("TOPIC");
    if (!(await this.signatureChecks(envelope))) throw new NoticeRejected("SIGNATURE");

    if (envelope.Type === "SubscriptionConfirmation") {
      if (!envelope.SubscribeURL || !isSnsUrl(envelope.SubscribeURL)) throw new NoticeRejected("SIGNATURE");
      await this.fetcher.confirmSubscription(envelope.SubscribeURL);
      return { type: "confirmed" };
    }

    const event = parse(SesNotificationSchema, envelope.Message);
    const occurredAt =
      event.delivery?.timestamp ?? event.bounce?.timestamp ?? event.complaint?.timestamp ?? event.mail.timestamp ?? envelope.Timestamp;
    return {
      type: "notice",
      notice: {
        noticeId: envelope.MessageId,
        kind: kindOf(event),
        messageId: event.mail.commonHeaders?.messageId ?? null,
        occurredAt: new Date(occurredAt),
      },
    };
  }

  private async signatureChecks(envelope: SnsEnvelope): Promise<boolean> {
    try {
      const certificate = new X509Certificate(await this.fetcher.fetchCertificate(envelope.SigningCertURL));
      return createVerify("RSA-SHA256").update(snsStringToSign(envelope), "utf8").verify(certificate.publicKey, envelope.Signature, "base64");
    } catch {
      return false;
    }
  }
}

function parse<T extends z.ZodType>(schema: T, json: string): z.infer<T> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new NoticeRejected("FORMAT");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new NoticeRejected("FORMAT");
  return result.data;
}
