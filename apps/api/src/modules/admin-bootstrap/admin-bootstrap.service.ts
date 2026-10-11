import { Injectable } from "@nestjs/common";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { advisoryXactLock, LockKey, type Tx } from "../../platform/database/transaction";
import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";
import { RoleRepository } from "../access-control/role.repository";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { UserRepository } from "../identity/user.repository";
import { AdminBootstrapMailSubject } from "./admin-bootstrap.mail-subject";

/** FR-034: the activation link is valid for 24 hours. */
export const ADMIN_ACTIVATION_TTL_MS = 24 * 3600 * 1000;

export interface BootstrapOperator {
  /** `os.hostname()` of the machine running the command. */
  host: string;
  /** OS user running the command. */
  user: string;
}

export interface BootstrapInput {
  email: string;
  printLink: boolean;
  operator: BootstrapOperator;
}

export type BootstrapMail = "SENT" | "RETRYING" | "NOT_SENT";

export type BootstrapResult =
  | { outcome: "REFUSED" }
  | { outcome: "GRANTED"; userId: string }
  | {
      outcome: "PENDING";
      expiresAt: Date;
      /** Only when the operator asked for it (`--print-link`). */
      link?: string;
      /**
       * The first attempt (017 research N3): `SENT`; `RETRYING` — not sent now, the API's worker
       * tries again; `NOT_SENT` — refused for good, or discarded because the link was printed.
       */
      mail: BootstrapMail;
      cancelledPrevious: boolean;
    };

/** An `ADMIN` assignment `ACTIVE` on an `ACTIVE` account (same rule as the last-admin guard). */
export async function hasActiveAdmin(tx: Tx): Promise<boolean> {
  const count = await tx.userRole.count({
    where: { status: "ACTIVE", role: { key: "ADMIN" }, user: { status: "ACTIVE" } },
  });
  return count > 0;
}

/**
 * First-ADMIN bootstrap, run only by the operational command (FR-030–FR-036, R14). Everything
 * happens under `ADMIN_BOOTSTRAP_LOCK`, so concurrent runs serialize and at most one bootstrap is
 * `PENDING` (the partial unique index is the last barrier). A verified e-mail gets `ADMIN` at
 * once; otherwise the `ADMIN` role is only created when the link is used (`AdminActivationService`),
 * so cancelling a pending bootstrap never leaves a role behind. No password is ever generated.
 */
@Injectable()
export class AdminBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditService,
    private readonly outbox: MailOutbox,
    private readonly mailSubject: AdminBootstrapMailSubject,
  ) {}

  async run({ email: rawEmail, printLink, operator }: BootstrapInput): Promise<BootstrapResult> {
    const email = normalizeEmail(rawEmail);
    const operatorMeta = { operatorHost: operator.host, operatorUser: operator.user };

    const result = await this.prisma.runInTransaction(async (tx) => {
      await advisoryXactLock(tx, LockKey.ADMIN_BOOTSTRAP_LOCK);

      if (await hasActiveAdmin(tx)) {
        await this.audit.record(tx, {
          type: "admin.bootstrap.refused",
          actorType: "OPERATOR",
          metadata: { reason: "ADMIN_ALREADY_ACTIVE", ...operatorMeta },
        });
        return { outcome: "REFUSED" as const };
      }

      const cancelledPrevious = await this.cancelPending(tx);
      const user = await this.users.findByEmail(email, tx);

      if (user?.emailVerifiedAt) {
        const bootstrap = await tx.adminBootstrap.create({
          data: {
            email,
            targetUserId: user.id,
            status: "COMPLETED",
            completedAt: new Date(),
            operatorHost: operator.host,
            operatorUser: operator.user,
          },
        });
        await this.requested(tx, bootstrap.id, email, "DIRECT_GRANT", operatorMeta);
        const grant = await this.roles.grant(tx, user.id, "ADMIN", null, "ADMIN_BOOTSTRAP");
        if (grant.created) {
          await this.audit.record(tx, {
            type: "role.granted",
            actorType: "OPERATOR",
            targetType: "USER_ROLE",
            targetId: grant.assignment.id,
            metadata: { userId: user.id, role: "ADMIN", via: "ADMIN_BOOTSTRAP" },
          });
        }
        await this.audit.record(tx, {
          type: "admin.bootstrap.completed",
          actorType: "OPERATOR",
          targetType: "USER",
          targetId: user.id,
          metadata: { bootstrapId: bootstrap.id, mode: "DIRECT_GRANT" },
        });
        return { outcome: "GRANTED" as const, userId: user.id };
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + ADMIN_ACTIVATION_TTL_MS);
      const bootstrap = await tx.adminBootstrap.create({
        data: {
          email,
          targetUserId: user?.id ?? null,
          status: "PENDING",
          tokenHash: hashToken(token),
          expiresAt,
          linkPrinted: printLink,
          operatorHost: operator.host,
          operatorUser: operator.user,
        },
      });
      await this.requested(tx, bootstrap.id, email, "ACTIVATION_LINK", operatorMeta);
      if (printLink) {
        await this.audit.record(tx, {
          type: "admin.bootstrap.link_printed",
          actorType: "OPERATOR",
          targetType: "ADMIN_BOOTSTRAP",
          targetId: bootstrap.id,
          metadata: operatorMeta,
        });
      }
      const deliveryId = await this.outbox.schedule(tx, "ADMIN_ACTIVATION", bootstrap.id);
      return { outcome: "PENDING" as const, token, expiresAt, cancelledPrevious, deliveryId };
    });

    if (result.outcome !== "PENDING") return result;

    // The first attempt is made here, after the commit, so the command can report it (exit 3).
    const outcome = await this.outbox.attemptSync(result.deliveryId, this.mailSubject.mail({ email, expiresAt: result.expiresAt }, result.token));
    let mail: BootstrapMail = outcome === "SENT" ? "SENT" : outcome === "REJECTED" ? "NOT_SENT" : "RETRYING";
    if (mail === "RETRYING" && printLink) {
      // The printed link is the operator's channel: a retry would rotate the token and kill it.
      await this.outbox.discardIfPending(result.deliveryId, "NOT_NEEDED");
      mail = "NOT_SENT";
    }
    return {
      outcome: "PENDING",
      expiresAt: result.expiresAt,
      ...(printLink ? { link: this.mailSubject.link(result.token) } : {}),
      mail,
      cancelledPrevious: result.cancelledPrevious,
    };
  }

  /** FR-032: a new run supersedes the pending bootstrap, whose link stops working. */
  private async cancelPending(tx: Tx): Promise<boolean> {
    const pending = await tx.adminBootstrap.findFirst({ where: { status: "PENDING" }, select: { id: true } });
    if (!pending) return false;
    await tx.adminBootstrap.update({
      where: { id: pending.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await this.audit.record(tx, {
      type: "admin.bootstrap.cancelled",
      actorType: "OPERATOR",
      targetType: "ADMIN_BOOTSTRAP",
      targetId: pending.id,
      metadata: { reason: "SUPERSEDED" },
    });
    return true;
  }

  private requested(
    tx: Tx,
    bootstrapId: string,
    email: string,
    mode: "DIRECT_GRANT" | "ACTIVATION_LINK",
    operatorMeta: { operatorHost: string; operatorUser: string },
  ): Promise<void> {
    return this.audit.record(tx, {
      type: "admin.bootstrap.requested",
      actorType: "OPERATOR",
      targetType: "ADMIN_BOOTSTRAP",
      targetId: bootstrapId,
      metadata: { email, mode, ...operatorMeta },
    });
  }
}
