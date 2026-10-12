import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import type { Tx } from "../../platform/database/transaction";
import { webLinks } from "../../platform/mail/links";
import type { DueDelivery, MailSubject, PrepareResult, PreparedMail } from "../../platform/mail/outbox/mail-subject";
import { MailSubjectRegistry } from "../../platform/mail/outbox/mail-subject";

/**
 * The admin activation e-mail (017 research N3): the CLI makes the first attempt; a retry by the
 * API's worker rotates `admin_bootstraps.token_hash` while the bootstrap is `PENDING` and not
 * expired, otherwise the e-mail is discarded (completed → `NOT_NEEDED`, cancelled → `REVOKED`). A
 * `--print-link` run never reaches a retry: the CLI discards its failed e-mail itself.
 */
@Injectable()
export class AdminBootstrapMailSubject implements MailSubject, OnModuleInit {
  readonly kind = "ADMIN_ACTIVATION" as const;
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

  link(token: string): string {
    return this.links.adminActivation(token);
  }

  mail(bootstrap: { email: string; expiresAt: Date }, token: string): PreparedMail {
    return { to: bootstrap.email, template: "admin-activation", params: { link: this.link(token), expiresAt: bootstrap.expiresAt } };
  }

  async prepare(tx: Tx, delivery: DueDelivery, now: Date): Promise<PrepareResult> {
    const id = delivery.adminBootstrapId!;
    await tx.$queryRaw`SELECT id FROM admin_bootstraps WHERE id = ${id}::uuid FOR UPDATE`;
    const bootstrap = await tx.adminBootstrap.findUniqueOrThrow({ where: { id }, select: { email: true, status: true, expiresAt: true } });
    if (bootstrap.status === "COMPLETED") return { discard: "NOT_NEEDED" };
    if (bootstrap.status === "CANCELLED") return { discard: "REVOKED" };
    if (!bootstrap.expiresAt || bootstrap.expiresAt <= now) return { discard: "EXPIRED" };

    const token = generateToken();
    await tx.adminBootstrap.update({ where: { id }, data: { tokenHash: hashToken(token) } });
    return { mail: this.mail({ email: bootstrap.email, expiresAt: bootstrap.expiresAt }, token) };
  }
}
