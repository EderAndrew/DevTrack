import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  type AdapterResult,
  headerOf,
  NOTICE_ID_MAX,
  type NoticeAdapter,
  type NoticeKind,
  NoticeRejected,
  type RawNotice,
} from "./notice";

/** Svix's tolerance on `svix-timestamp` (contracts/configuration.md, constants). */
export const RESEND_TIMESTAMP_TOLERANCE_MS = 5 * 60_000;

/** The `v1,` signature of `${id}.${timestamp}.${body}` with the secret (Svix format, research N6). */
export function resendSignature(secret: Buffer, id: string, timestamp: string, body: Buffer): string {
  return createHmac("sha256", secret).update(`${id}.${timestamp}.`).update(body).digest("base64");
}

/**
 * The fields of a Resend notice we use, strict on them; the rest of the body (addresses, subject,
 * the bounce message) is never read. `message_id` is our Message-ID (research N5); a `headers` list
 * carrying it is accepted too.
 */
const ResendNoticeSchema = z.object({
  type: z.string().min(1).max(100),
  created_at: z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value))),
  data: z
    .object({
      message_id: z.string().max(998).optional(),
      headers: z.array(z.object({ name: z.string().max(200), value: z.string().max(998) })).max(100).optional(),
      bounce: z.object({ type: z.string().max(100).optional() }).optional(),
    })
    .optional(),
});

type ResendNotice = z.infer<typeof ResendNoticeSchema>;

/** Research N7: Resend events in our terms. */
function kindOf(notice: ResendNotice): NoticeKind {
  switch (notice.type) {
    case "email.delivered":
      return "DELIVERED";
    case "email.bounced":
      return notice.data?.bounce?.type === "Permanent" ? "BOUNCED" : "TEMPORARY";
    case "email.delivery_delayed":
      return "TEMPORARY";
    case "email.complained":
      return "COMPLAINED";
    case "email.failed":
      return "REJECTED";
    default:
      return "IGNORED";
  }
}

function messageIdOf(notice: ResendNotice): string | null {
  const data = notice.data;
  if (data?.message_id) return data.message_id;
  return data?.headers?.find((header) => header.name.toLowerCase() === "message-id")?.value ?? null;
}

/**
 * Resend notices (research N6): Svix headers `svix-id`, `svix-timestamp` and `svix-signature`;
 * HMAC-SHA256 of `${id}.${timestamp}.${body}` with the key of `MAIL_NOTICE_SECRET`; any `v1,`
 * signature of the header may match (constant-time compare); the timestamp within ± 5 min of the
 * server clock. The body is parsed only after the signature checked.
 */
export class ResendNoticeAdapter implements NoticeAdapter {
  constructor(private readonly secret: Buffer) {}

  async verify(raw: RawNotice, now: Date): Promise<AdapterResult> {
    const id = headerOf(raw.headers, "svix-id");
    const timestamp = headerOf(raw.headers, "svix-timestamp");
    const signatures = headerOf(raw.headers, "svix-signature");
    if (!id || !timestamp || !signatures || id.length > NOTICE_ID_MAX) throw new NoticeRejected("SIGNATURE");
    if (!/^\d{1,12}$/.test(timestamp)) throw new NoticeRejected("TIMESTAMP");
    if (Math.abs(now.getTime() - Number(timestamp) * 1000) > RESEND_TIMESTAMP_TOLERANCE_MS) throw new NoticeRejected("TIMESTAMP");

    const expected = Buffer.from(resendSignature(this.secret, id, timestamp, raw.body), "base64");
    const matches = signatures
      .split(" ")
      .filter((entry) => entry.startsWith("v1,"))
      .map((entry) => Buffer.from(entry.slice(3), "base64"))
      .some((given) => given.length === expected.length && timingSafeEqual(given, expected));
    if (!matches) throw new NoticeRejected("SIGNATURE");

    let parsed: ResendNotice;
    try {
      const result = ResendNoticeSchema.safeParse(JSON.parse(raw.body.toString("utf8")));
      if (!result.success) throw new NoticeRejected("FORMAT");
      parsed = result.data;
    } catch {
      throw new NoticeRejected("FORMAT");
    }
    return {
      type: "notice",
      notice: { noticeId: id, kind: kindOf(parsed), messageId: messageIdOf(parsed), occurredAt: new Date(parsed.created_at) },
    };
  }
}
