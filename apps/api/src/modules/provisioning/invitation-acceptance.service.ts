import { Injectable } from "@nestjs/common";
import type { InvitationAccepted, InvitationPreview } from "@repo/contracts";
import { hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import { AppException, tokenInvalid } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { PublicRateLimit } from "../auth/public-rate-limit";
import { InvitationService } from "./invitation.service";
import { RoleGrantAcceptance } from "./role-grant-acceptance.service";

/** Refusals of `RoleGrantAcceptance` that are audited as `invitation.acceptance_refused` (FR-070). */
const AUDITED_REFUSALS = {
  SELF_INVITE_FORBIDDEN: "SELF_INVITE",
  SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
  WRONG_ACCOUNT: "WRONG_ACCOUNT",
} as const;

type Outcome =
  | { kind: "accepted"; result: InvitationAccepted }
  /** Lazy expiry was written: commit it, then answer TOKEN_INVALID. */
  | { kind: "invalid" };

/**
 * Invitation acceptance by the token holder (FR-044–FR-049, R15). The invitation row is
 * locked for the whole acceptance, so concurrent or repeated acceptances produce one identity
 * and one assignment. Every unusable token gets the same generic `TOKEN_INVALID`, except the
 * accepting account repeating its own acceptance (`200`, no effects).
 */
@Injectable()
export class InvitationAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly invitations: InvitationService,
    private readonly acceptance: RoleGrantAcceptance,
    private readonly audit: AuditService,
  ) {}

  async preview(token: string, ctx: RequestContext): Promise<InvitationPreview> {
    await this.rateLimit.enforce("invitation_preview", hashToken(token), ctx);
    const preview = await this.prisma.runInTransaction(async (tx) => {
      const lookup = await this.invitations.findForAcceptance(tx, token);
      if (lookup.kind !== "found" || lookup.invitation.status !== "PENDING") return null;
      const { invitation } = lookup;
      return {
        role: invitation.roleKey,
        email: invitation.email,
        displayName: invitation.displayName,
        mode: await this.acceptance.resolveMode(tx, invitation.email),
      };
    });
    if (!preview) throw tokenInvalid();
    return preview;
  }

  async accept(token: string, password: string | undefined, ctx: RequestContext): Promise<InvitationAccepted> {
    await this.rateLimit.enforce("invitation_accept", hashToken(token), ctx);
    const currentUserId = ctx.auth?.userId ?? null;
    let refused: { invitationId: string } | null = null;

    let outcome: Outcome;
    try {
      outcome = await this.prisma.runInTransaction<Outcome>(async (tx) => {
        const lookup = await this.invitations.findForAcceptance(tx, token);
        if (lookup.kind !== "found") return { kind: "invalid" };
        const { invitation } = lookup;

        if (invitation.status === "ACCEPTED" && currentUserId && invitation.acceptedByUserId === currentUserId) {
          return {
            kind: "accepted",
            result: { role: invitation.roleKey, mode: await this.acceptance.resolveMode(tx, invitation.email) },
          };
        }
        if (invitation.status !== "PENDING") return { kind: "invalid" };

        refused = { invitationId: invitation.id };
        const accepted = await this.acceptance.accept(tx, {
          email: invitation.email,
          roleKey: invitation.roleKey,
          displayName: invitation.displayName,
          password: password ?? null,
          currentUserId,
          issuerUserId: invitation.invitedById,
          via: "INVITATION",
          requestId: ctx.requestId,
        });
        refused = null;

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: accepted.userId },
        });
        const byUser = currentUserId === accepted.userId;
        await this.audit.record(tx, {
          type: "invitation.accepted",
          actorType: byUser ? "USER" : "ANONYMOUS",
          actorUserId: byUser ? accepted.userId : null,
          targetType: "INVITATION",
          targetId: invitation.id,
          requestId: ctx.requestId,
          metadata: { role: invitation.roleKey, userId: accepted.userId, mode: accepted.mode },
        });
        return { kind: "accepted", result: { role: invitation.roleKey, mode: accepted.mode } };
      });
    } catch (error) {
      await this.auditRefusal(error, refused, currentUserId, ctx);
      throw error;
    }

    if (outcome.kind === "invalid") throw tokenInvalid();
    return outcome.result;
  }

  /** The acceptance rolled back; the refusal is recorded in its own transaction. */
  private async auditRefusal(
    error: unknown,
    refused: { invitationId: string } | null,
    currentUserId: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    if (!refused || !(error instanceof AppException)) return;
    const reason = AUDITED_REFUSALS[error.code as keyof typeof AUDITED_REFUSALS];
    if (!reason) return;
    await this.audit.record(this.prisma, {
      type: "invitation.acceptance_refused",
      actorType: currentUserId ? "USER" : "ANONYMOUS",
      actorUserId: currentUserId,
      targetType: "INVITATION",
      targetId: refused.invitationId,
      requestId: ctx.requestId,
      metadata: { reason },
    });
  }
}
