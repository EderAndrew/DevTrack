import { createHmac, createSign, generateKeyPairSync, type KeyObject, randomUUID } from "node:crypto";
import request from "supertest";
import type { AppConfig } from "../../src/platform/config/config.schema";
import { CertificateFetcher, isSnsUrl } from "../../src/platform/mail/notices/certificate-fetcher";
import type { TestApp } from "./test-app";

/**
 * Signed provider notices for the 017/US2 suites (research N14). No test talks to Resend or AWS:
 * Resend notices are signed with the test secret (Svix format), SNS notices with an RSA key and a
 * self-signed certificate made here, served by `TestCertificateFetcher` under the real SNS host.
 * The signing is written apart from the adapters on purpose, so a bug there is not mirrored here.
 */

export interface SignedNotice {
  headers: Record<string, string>;
  body: string;
}

/** The Resend key of the test configuration (`MAIL_NOTICE_SECRET` of `.env.test.example`). */
export function resendSecretOf(config: AppConfig): Buffer {
  if (config.mail.notices.provider !== "resend") throw new Error("the app does not accept Resend notices");
  return config.mail.notices.secret;
}

export type ResendEventType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.failed"
  | "email.delivery_delayed"
  | "email.opened"
  | "email.clicked"
  | "email.sent";

export interface ResendNoticeOptions {
  type: ResendEventType;
  /** Our Message-ID, as Resend returns it in `data.message_id`; omitted when null. */
  messageId: string | null;
  /** `data.bounce.type` of `email.bounced` (default `Permanent`). */
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  /** The event time (`created_at`); also the signing time unless `signedAt` is given. */
  at: Date;
  secret: Buffer;
  /** `svix-id`, the notice id (default: a new one). */
  id?: string;
  /** When the notice is signed (`svix-timestamp`). */
  signedAt?: Date;
  /** Replaces the JSON body (still signed). */
  rawBody?: string;
}

/** A Resend notice with the Svix headers, signed with `secret`. */
export function signedResendNotice(options: ResendNoticeOptions): SignedNotice {
  const id = options.id ?? `msg_${randomUUID().replaceAll("-", "")}`;
  const timestamp = String(Math.floor((options.signedAt ?? options.at).getTime() / 1000));
  const body =
    options.rawBody ??
    JSON.stringify({
      type: options.type,
      created_at: options.at.toISOString(),
      data: {
        created_at: options.at.toISOString(),
        email_id: randomUUID(),
        from: "DevTrack <nao-responda@devtrack.test>",
        to: ["MARCADOR-DESTINO-017@example.test"],
        subject: "Convite",
        ...(options.messageId === null ? {} : { message_id: options.messageId }),
        ...(options.type === "email.bounced"
          ? { bounce: { type: options.bounceType ?? "Permanent", subType: "General", message: "MARCADOR-BOUNCE-017" } }
          : {}),
      },
    });
  const signature = createHmac("sha256", options.secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` },
    body,
  };
}

/** Posts a notice as the provider would: no Origin, no cookie, the exact bytes. */
export function postNotice(t: TestApp, provider: string, notice: SignedNotice): request.Test {
  const req = request(t.baseUrl).post(`/api/mail/notices/${provider}`);
  for (const [name, value] of Object.entries(notice.headers)) req.set(name, value);
  return req.send(notice.body);
}

// --- SNS (SES) ---------------------------------------------------------------------------------

/** The real host rule applies: tests serve their certificate under SNS's own name. */
export const SNS_CERT_URL = "https://sns.sa-east-1.amazonaws.com/SimpleNotificationService-0000000000000000000000.pem";
export const TEST_TOPIC_ARN = "arn:aws:sns:sa-east-1:123456789012:devtrack-ses-notices";

/** A key pair and a self-signed certificate of it. */
export interface SnsSigner {
  privateKey: KeyObject;
  certificatePem: string;
}

/** A new RSA key and its self-signed certificate (X.509 v3, sha256WithRSAEncryption). */
export function createSnsSigner(): SnsSigner {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privateKey, certificatePem: selfSignedCertificate(privateKey, publicKey) };
}

/** Serves the test certificates by URL, keeping the real host rule; records every fetch. */
export class TestCertificateFetcher extends CertificateFetcher {
  readonly certificates = new Map<string, string>();
  readonly fetched: string[] = [];
  readonly confirmed: string[] = [];

  serve(url: string, signer: SnsSigner): this {
    this.certificates.set(url, signer.certificatePem);
    return this;
  }

  override async fetchCertificate(url: string): Promise<string> {
    this.fetched.push(url);
    if (!isSnsUrl(url)) throw new Error("not an SNS certificate URL");
    const pem = this.certificates.get(url);
    if (!pem) throw new Error("no such certificate");
    return pem;
  }

  override async confirmSubscription(url: string): Promise<void> {
    if (!isSnsUrl(url)) throw new Error("not an SNS subscription URL");
    this.confirmed.push(url);
  }
}

type SnsEnvelope = Record<string, string>;

const SNS_SIGNED_KEYS = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
} as const;

function signSns(envelope: SnsEnvelope, signer: SnsSigner): string {
  const keys = SNS_SIGNED_KEYS[envelope.Type as keyof typeof SNS_SIGNED_KEYS];
  const text = keys.filter((key) => envelope[key] !== undefined).map((key) => `${key}\n${envelope[key]}\n`).join("");
  return createSign("RSA-SHA256").update(text, "utf8").sign(signer.privateKey, "base64");
}

function snsRequest(envelope: SnsEnvelope): SignedNotice {
  return {
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "x-amz-sns-message-type": envelope.Type!,
      "x-amz-sns-message-id": envelope.MessageId!,
      "x-amz-sns-topic-arn": envelope.TopicArn!,
    },
    body: JSON.stringify(envelope),
  };
}

export type SesEventType = "Delivery" | "Bounce" | "Complaint" | "Reject" | "Open";

export interface SnsNoticeOptions {
  type: SesEventType;
  messageId: string | null;
  bounceType?: "Permanent" | "Transient" | "Undetermined";
  at: Date;
  signer: SnsSigner;
  topicArn?: string;
  certUrl?: string;
  /** Signs with this key instead of the certificate's (a certificate that does not sign). */
  signWith?: SnsSigner;
  signatureVersion?: string;
  /** SNS `MessageId`, the notice id (default: a new one). */
  id?: string;
}

/** An SES event in an SNS `Notification`, signed (SignatureVersion 2). */
export function signedSnsNotice(options: SnsNoticeOptions): SignedNotice {
  const at = options.at.toISOString();
  const event = {
    notificationType: options.type,
    mail: {
      timestamp: at,
      messageId: "0100018f-ses-id",
      source: "nao-responda@devtrack.test",
      destination: ["MARCADOR-DESTINO-017@example.test"],
      commonHeaders: { ...(options.messageId === null ? {} : { messageId: options.messageId }), subject: "Convite" },
    },
    ...(options.type === "Bounce" ? { bounce: { bounceType: options.bounceType ?? "Permanent", timestamp: at, bouncedRecipients: [] } } : {}),
    ...(options.type === "Complaint" ? { complaint: { timestamp: at, complainedRecipients: [] } } : {}),
    ...(options.type === "Delivery" ? { delivery: { timestamp: at, recipients: [] } } : {}),
  };
  const envelope: SnsEnvelope = {
    Type: "Notification",
    MessageId: options.id ?? randomUUID(),
    TopicArn: options.topicArn ?? TEST_TOPIC_ARN,
    Message: JSON.stringify(event),
    Timestamp: at,
    SignatureVersion: options.signatureVersion ?? "2",
    SigningCertURL: options.certUrl ?? SNS_CERT_URL,
    UnsubscribeURL: "https://sns.sa-east-1.amazonaws.com/?Action=Unsubscribe",
  };
  envelope.Signature = signSns(envelope, options.signWith ?? options.signer);
  return snsRequest(envelope);
}

/** An SNS `SubscriptionConfirmation`, signed. */
export function snsSubscriptionConfirmation(options: {
  signer: SnsSigner;
  topicArn?: string;
  subscribeUrl?: string;
  at?: Date;
}): SignedNotice {
  const topicArn = options.topicArn ?? TEST_TOPIC_ARN;
  const envelope: SnsEnvelope = {
    Type: "SubscriptionConfirmation",
    MessageId: randomUUID(),
    Token: "token-de-confirmacao-017",
    TopicArn: topicArn,
    Message: `You have chosen to subscribe to the topic ${topicArn}.`,
    SubscribeURL:
      options.subscribeUrl ?? `https://sns.sa-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=token-de-confirmacao-017`,
    Timestamp: (options.at ?? new Date()).toISOString(),
    SignatureVersion: "2",
    SigningCertURL: SNS_CERT_URL,
  };
  envelope.Signature = signSns(envelope, options.signer);
  return snsRequest(envelope);
}

// --- A minimal DER encoder for the self-signed certificate (node:crypto reads X.509, never writes it).

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const der = (tag: number, ...content: Buffer[]) => {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};
const sequence = (...content: Buffer[]) => der(0x30, ...content);

function oid(dotted: string): Buffer {
  const [first, second, ...rest] = dotted.split(".").map(Number);
  const bytes = [first! * 40 + second!];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    for (let v = value >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}

const utcTime = (date: Date) => der(0x17, Buffer.from(`${date.toISOString().slice(2, 19).replace(/[-:T]/g, "")}Z`));
const SHA256_WITH_RSA = sequence(oid("1.2.840.113549.1.1.11"), der(0x05));

function selfSignedCertificate(privateKey: KeyObject, publicKey: KeyObject): string {
  const name = sequence(der(0x31, sequence(oid("2.5.4.3"), der(0x0c, Buffer.from("sns.amazonaws.com")))));
  const now = Date.now();
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([0x01, ...Array.from({ length: 7 }, () => Math.floor(Math.random() * 256))])),
    SHA256_WITH_RSA,
    name,
    sequence(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 365 * 86_400_000))),
    name,
    publicKey.export({ type: "spki", format: "der" }),
  );
  const signature = createSign("RSA-SHA256").update(tbs).sign(privateKey);
  const certificate = sequence(tbs, SHA256_WITH_RSA, der(0x03, Buffer.from([0]), signature));
  const base64 = certificate.toString("base64").match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}
