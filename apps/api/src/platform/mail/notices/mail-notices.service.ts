import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MailNoticeProvider as Provider } from "@repo/contracts";
import type { MailKind, MailNoticeKind, MailNoticeProvider } from "../../../generated/prisma/client";
// The audit trail is cross-cutting (global module), as in the outbox.
import { AuditService } from "../../../modules/audit/audit.service";
import { CLOCK, type Clock } from "../../clock/clock";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/config.schema";
import { PrismaService } from "../../database/prisma.service";
import { noticeRejected, notFound, rateLimited } from "../../http/errors";
import { RateLimitService } from "../../rate-limit/rate-limit.service";
import { CertificateFetcher } from "./certificate-fetcher";
import { type NoticeAdapter, NoticeRejected, parseMessageId, type RawNotice, type VerifiedNotice } from "./notice";
import { noticeTransition } from "./notice-transition";
import { ResendNoticeAdapter } from "./resend.adapter";
import { SesNoticeAdapter } from "./ses.adapter";

/** What a verified notice did; the answer is `200 {}` in every case (contracts/http-api.md). */
export type NoticeOutcome = "APPLIED" | "RECORDED" | "DUPLICATE" | "UNMATCHED" | "IGNORED" | "CONFIRMED";

const PROVIDER: Record<Provider, MailNoticeProvider> = { resend: "RESEND", ses: "SES" };

const RATE_WINDOW_SEC = 60;

/**
 * Provider notices (017 research N5–N7, contracts/mail-delivery.md step 5):
 * 1. only the configured provider's path exists (`404` otherwise), limited per IP;
 * 2. the adapter verifies the raw body before any read of the deliveries; a refusal is a log
 *    `mail.notice_rejected` and `401 NOTICE_REJECTED`, never an audit event (N12);
 * 3. the notice is linked to its delivery by our Message-ID before anything is stored; an unknown one
 *    is a log `mail.notice_unmatched` only (US2-7);
 * 4. under the delivery's row lock it is stored once by `(provider, notice_id)` (a repeat changes
 *    nothing, FR-012) and applied by `noticeTransition`; an `UNDELIVERED` is audited with
 *    `source: NOTICE`. The invitation or account behind the delivery is never touched (FR-017).
 */
@Injectable()
export class MailNoticesService {
  private readonly logger = new Logger("MailNotices");
  private readonly adapter: NoticeAdapter | null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    fetcher: CertificateFetcher,
  ) {
    const notices = config.mail.notices;
    this.adapter =
      notices.provider === "resend"
        ? new ResendNoticeAdapter(notices.secret)
        : notices.provider === "ses"
          ? new SesNoticeAdapter(notices.topicArn, fetcher)
          : null;
  }

  async receive(provider: string, raw: RawNotice, ip: string | null): Promise<NoticeOutcome> {
    const configured = this.config.mail.notices.provider;
    if (!this.adapter || configured === "none" || provider !== configured) throw notFound();

    const limit = await this.rateLimit.hit("mail_notices:ip", ip ?? "unknown", {
      limit: this.config.rateLimit.mailNoticesPerMinute,
      windowSec: RATE_WINDOW_SEC,
    });
    if (limit.blocked) throw rateLimited(limit.retryAfterSec);

    let verified;
    try {
      verified = await this.adapter.verify(raw, this.clock.now());
    } catch (error) {
      if (!(error instanceof NoticeRejected)) throw error;
      this.logger.warn({ provider, reason: error.reason }, "mail.notice_rejected");
      throw noticeRejected();
    }
    if (verified.type === "confirmed") return "CONFIRMED";
    return this.apply(PROVIDER[configured], verified.notice);
  }

  /** Steps 3 and 4 for a notice already verified. */
  async apply(provider: MailNoticeProvider, notice: VerifiedNotice): Promise<NoticeOutcome> {
    if (notice.kind === "IGNORED") return "IGNORED";
    const ref = parseMessageId(notice.messageId);
    const outcome = ref
      ? await this.prisma.runInTransaction(async (tx) => {
          const rows = await tx.$queryRaw<{ kind: MailKind; status: string; attempts: number; message_id: string | null; delivered_at: Date | null }[]>`
            SELECT kind, status, attempts, message_id, delivered_at FROM mail_deliveries WHERE id = ${ref.deliveryId}::uuid FOR UPDATE`;
          const row = rows[0];
          if (!row || ref.attempt > row.attempts || domainOf(row.message_id) !== ref.domain) return "UNMATCHED" as const;

          const { count } = await tx.mailNotice.createMany({
            data: [
              {
                provider,
                noticeId: notice.noticeId,
                kind: notice.kind as MailNoticeKind,
                deliveryId: ref.deliveryId,
                attempt: ref.attempt,
                occurredAt: notice.occurredAt,
                receivedAt: this.clock.now(),
              },
            ],
            skipDuplicates: true,
          });
          if (count === 0) return "DUPLICATE" as const;

          const change = noticeTransition(
            { status: row.status as never, attempts: row.attempts, deliveredAt: row.delivered_at },
            ref.attempt,
            notice.kind,
            notice.occurredAt,
          );
          if (!change) return "RECORDED" as const;
          await tx.mailDelivery.update({ where: { id: ref.deliveryId }, data: change });
          if (change.status === "UNDELIVERED") {
            await this.audit.record(tx, {
              type: "mail_delivery.undelivered",
              actorType: "SYSTEM",
              targetType: "MAIL_DELIVERY",
              targetId: ref.deliveryId,
              metadata: { kind: row.kind, reason: change.undeliveredReason!, source: "NOTICE" },
            });
          }
          return "APPLIED" as const;
        })
      : ("UNMATCHED" as const);
    if (outcome === "UNMATCHED") this.logger.log({ provider, kind: notice.kind }, "mail.notice_unmatched");
    return outcome;
  }
}

/** The domain of a stored Message-ID (`<id.n@domain>`), lower case. */
function domainOf(messageId: string | null): string | null {
  return messageId ? (/@([^<>@\s]+)>?$/.exec(messageId)?.[1]?.toLowerCase() ?? null) : null;
}
