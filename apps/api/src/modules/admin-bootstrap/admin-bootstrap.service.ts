import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { advisoryXactLock, LockKey, type Tx } from "../../platform/database/transaction";
import { Mailer } from "../../platform/mail/mailer";
import { RoleRepository } from "../access-control/role.repository";
import { AuditService } from "../audit/audit.service";
import { webLinks } from "../auth/signup.service";
import { normalizeEmail } from "../identity/email";
import { UserRepository } from "../identity/user.repository";

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

export type BootstrapResult =
  | { outcome: "REFUSED" }
  | { outcome: "GRANTED"; userId: string }
  | {
      outcome: "PENDING";
      expiresAt: Date;
      /** Only when the operator asked for it (`--print-link`). */
      link?: string;
      mailDelivered: boolean;
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
  private readonly links: ReturnType<typeof webLinks>;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {
    this.links = webLinks(config.webOrigin);
  }

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
      return { outcome: "PENDING" as const, token, expiresAt, cancelledPrevious };
    });

    if (result.outcome !== "PENDING") return result;

    // Sent synchronously after commit: the command reports a failed delivery (exit 3).
    const link = this.links.adminActivation(result.token);
    let mailDelivered = true;
    try {
      await this.mailer.send({ to: email, template: "admin-activation", params: { link, expiresAt: result.expiresAt } });
    } catch {
      mailDelivered = false;
    }
    return {
      outcome: "PENDING",
      expiresAt: result.expiresAt,
      ...(printLink ? { link } : {}),
      mailDelivered,
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
