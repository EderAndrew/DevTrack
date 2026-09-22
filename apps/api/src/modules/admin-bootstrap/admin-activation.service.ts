import { Injectable } from "@nestjs/common";
import type { AdminActivated, AdminActivationPreview } from "@repo/contracts";
import { hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { advisoryXactLock, LockKey } from "../../platform/database/transaction";
import { bootstrapAlreadyDone, tokenInvalid } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { PublicRateLimit } from "../auth/public-rate-limit";
import { RoleGrantAcceptance } from "../provisioning/role-grant-acceptance.service";
import { hasActiveAdmin } from "./admin-bootstrap.service";

interface LockedBootstrap {
  id: string;
  email: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  expires_at: Date | null;
  target_user_id: string | null;
}

type Activation = { role: "ADMIN" } | { alreadyDone: true };

/**
 * Completes a bootstrap issued by the operational command (R14, FR-034, FR-035, US3-10). This
 * route never creates a bootstrap: it only consumes a `PENDING` one through the same
 * acceptance rules as invitations (`RoleGrantAcceptance`, R15). Any refusal of the acceptance
 * rolls everything back and leaves the link usable.
 */
@Injectable()
export class AdminActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly acceptance: RoleGrantAcceptance,
    private readonly audit: AuditService,
  ) {}

  async preview(token: string, ctx: RequestContext): Promise<AdminActivationPreview> {
    const tokenHash = hashToken(token);
    await this.rateLimit.enforce("admin_activation_preview", tokenHash, ctx);
    return this.prisma.runInTransaction(async (tx) => {
      const bootstrap = await tx.adminBootstrap.findFirst({
        where: { tokenHash, status: "PENDING", expiresAt: { gt: new Date() } },
        select: { email: true },
      });
      if (!bootstrap) throw tokenInvalid();
      return { email: bootstrap.email, mode: await this.acceptance.resolveMode(tx, bootstrap.email) };
    });
  }

  async activate(token: string, password: string | undefined, ctx: RequestContext): Promise<AdminActivated> {
    const tokenHash = hashToken(token);
    await this.rateLimit.enforce("admin_activation", tokenHash, ctx);
    const currentUserId = ctx.auth?.userId ?? null;

    const result = await this.prisma.runInTransaction<Activation>(async (tx) => {
      await advisoryXactLock(tx, LockKey.ADMIN_BOOTSTRAP_LOCK);
      const [bootstrap] = await tx.$queryRaw<LockedBootstrap[]>`
        SELECT id, email, status, expires_at, target_user_id
        FROM admin_bootstraps WHERE token_hash = ${tokenHash} FOR UPDATE`;

      // The activator repeating a completed activation from its own session: no effect.
      if (bootstrap?.status === "COMPLETED" && currentUserId && bootstrap.target_user_id === currentUserId) {
        return { role: "ADMIN" };
      }
      if (!bootstrap || bootstrap.status !== "PENDING" || !bootstrap.expires_at || bootstrap.expires_at <= new Date()) {
        throw tokenInvalid();
      }

      if (await hasActiveAdmin(tx)) {
        await tx.adminBootstrap.update({
          where: { id: bootstrap.id },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await this.audit.record(tx, {
          type: "admin.bootstrap.cancelled",
          actorType: "SYSTEM",
          targetType: "ADMIN_BOOTSTRAP",
          targetId: bootstrap.id,
          requestId: ctx.requestId,
          metadata: { reason: "ADMIN_ALREADY_ACTIVE" },
        });
        // Committed before answering 409, so the cancelled link stays cancelled.
        return { alreadyDone: true };
      }

      const accepted = await this.acceptance.accept(tx, {
        email: bootstrap.email,
        roleKey: "ADMIN",
        // The bootstrap collects no name; the owner is identified by the e-mail's local part.
        displayName: bootstrap.email.split("@")[0]!,
        password: password ?? null,
        currentUserId,
        issuerUserId: null,
        via: "ADMIN_BOOTSTRAP",
        requestId: ctx.requestId,
      });
      await tx.adminBootstrap.update({
        where: { id: bootstrap.id },
        data: { status: "COMPLETED", completedAt: new Date(), targetUserId: accepted.userId },
      });
      await this.audit.record(tx, {
        type: "admin.bootstrap.completed",
        actorType: "ANONYMOUS",
        targetType: "USER",
        targetId: accepted.userId,
        requestId: ctx.requestId,
        metadata: { bootstrapId: bootstrap.id, mode: accepted.mode },
      });
      return { role: "ADMIN" };
    });

    if ("alreadyDone" in result) throw bootstrapAlreadyDone();
    return result;
  }
}
