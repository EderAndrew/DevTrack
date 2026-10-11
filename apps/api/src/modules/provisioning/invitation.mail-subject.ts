import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { MailKind } from "../../generated/prisma/client";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import type { DueDelivery, PrepareResult, PreparedMail } from "../../platform/mail/outbox/mail-subject";
import { MailSubjectRegistry } from "../../platform/mail/outbox/mail-subject";

export type InvitationMailKind = Extract<MailKind, "INVITATION_TEACHER" | "INVITATION_MANAGER">;

/** The e-mail kind of an invitation's role. */
export const invitationMailKind = (roleKey: string): InvitationMailKind =>
  roleKey === "MANAGER" ? "INVITATION_MANAGER" : "INVITATION_TEACHER";

/**
 * The TEACHER and MANAGER invitation e-mails (017 research N3): the first attempt carries the
 * request's token; a retry rotates `invitations.token_hash` (the previous link dies) unless the
 * invitation is no longer `PENDING` or has expired, when the e-mail is discarded.
 */
@Injectable()
export class InvitationMailSubject implements OnModuleInit {
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly registry: MailSubjectRegistry,
  ) {
    this.links = webLinks(config.webOrigin);
  }

  onModuleInit(): void {
    for (const kind of ["INVITATION_TEACHER", "INVITATION_MANAGER"] as const) {
      this.registry.register({ kind, prepare: (tx, delivery, now) => this.prepare(tx, delivery, now) });
    }
  }

  mail(invitation: { email: string; displayName: string; expiresAt: Date; role: { key: string } }, token: string): PreparedMail {
    const params = { displayName: invitation.displayName, link: this.links.invitation(token), expiresAt: invitation.expiresAt };
    return invitationMailKind(invitation.role.key) === "INVITATION_MANAGER"
      ? { to: invitation.email, template: "invitation-manager", params }
      : { to: invitation.email, template: "invitation-teacher", params };
  }

  async prepare(tx: Tx, delivery: DueDelivery, now: Date): Promise<PrepareResult> {
    const id = delivery.invitationId!;
    await tx.$queryRaw`SELECT id FROM invitations WHERE id = ${id}::uuid FOR UPDATE`;
    const invitation = await tx.invitation.findUniqueOrThrow({
      where: { id },
      select: { email: true, displayName: true, expiresAt: true, status: true, role: { select: { key: true } } },
    });
    if (invitation.status === "ACCEPTED") return { discard: "ACCEPTED" };
    if (invitation.status === "REVOKED") return { discard: "REVOKED" };
    if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) return { discard: "EXPIRED" };

    const token = generateToken();
    await tx.invitation.update({ where: { id }, data: { tokenHash: hashToken(token) } });
    return { mail: this.mail(invitation, token) };
  }
}
