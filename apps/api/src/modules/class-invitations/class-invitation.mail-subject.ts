import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import type { DueDelivery, MailSubject, PrepareResult, PreparedMail } from "../../platform/mail/outbox/mail-subject";
import { MailSubjectRegistry } from "../../platform/mail/outbox/mail-subject";

/** Invitation fields the `class-invitation` e-mail needs; never the token (it only goes into the link). */
export const INVITATION_MAIL_SELECT = {
  email: true,
  expiresAt: true,
  schoolClass: { select: { name: true, code: true, period: true, teacher: { select: { name: true } } } },
} as const;

type InvitationMailRow = {
  email: string;
  expiresAt: Date;
  schoolClass: { name: string; code: string; period: string | null; teacher: { name: string } };
};

/**
 * The class invitation e-mails (003 D5, 017 research N3): the first attempt carries the token the
 * request minted; each retry, through `prepare`, rotates `token_hash`, so the previous link stops
 * working. A retry never changes `expires_at`, `send_count` or `last_sent_at` (003 FR-015).
 */
@Injectable()
export class ClassInvitationMailSubject implements MailSubject, OnModuleInit {
  readonly kind = "CLASS_INVITATION" as const;
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly registry: MailSubjectRegistry,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** The e-mail of `row` with the link of `token`. */
  mail(row: InvitationMailRow, token: string): PreparedMail {
    const { schoolClass } = row;
    return {
      to: row.email,
      template: "class-invitation",
      params: {
        className: schoolClass.name,
        classCode: schoolClass.code,
        period: schoolClass.period,
        teacherName: schoolClass.teacher.name,
        link: this.links.classInvitation(token),
        expiresAt: row.expiresAt,
      },
    };
  }

  /** Discarded unless the invitation is still effectively `PENDING` (accepted, cancelled or expired). */
  async prepare(tx: Tx, delivery: DueDelivery, now: Date): Promise<PrepareResult> {
    const id = delivery.classInvitationId!;
    await tx.$queryRaw`SELECT id FROM class_invitations WHERE id = ${id}::uuid FOR UPDATE`;
    const invitation = await tx.classInvitation.findUniqueOrThrow({
      where: { id },
      select: { ...INVITATION_MAIL_SELECT, status: true },
    });
    if (invitation.status === "ACCEPTED") return { discard: "ACCEPTED" };
    if (invitation.status === "CANCELLED") return { discard: "REVOKED" };
    if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) return { discard: "EXPIRED" };

    const token = generateToken();
    await tx.classInvitation.update({ where: { id }, data: { tokenHash: hashToken(token) } });
    return { mail: this.mail(invitation, token) };
  }
}
