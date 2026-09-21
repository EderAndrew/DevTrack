import { Injectable } from "@nestjs/common";
import type { InvitationStatus, RoleAssignmentStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { alreadyManager, AppException, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RoleLifecycleService } from "../access-control/role-lifecycle.service";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { InvitationService, type InvitationScope } from "./invitation.service";
import { type InvitationView, toInvitationView } from "./invitation.view";

/** `ManagerView` of contracts/http-api.md. */
export interface ManagerView {
  userId: string;
  name: string;
  email: string;
  status: RoleAssignmentStatus;
}

const SCOPE: InvitationScope = { roleKey: "MANAGER" };

/**
 * ADMIN's management of MANAGERs (FR-040, FR-052). Deactivation and reactivation go through
 * `RoleLifecycleService`, which revokes sessions and audits; nothing is ever deleted (FR-053).
 */
@Injectable()
export class ManagersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
    private readonly lifecycle: RoleLifecycleService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ManagerView[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { role: { key: "MANAGER" } },
      select: { status: true, user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
    });
    return rows.map((row) => ({ userId: row.user.id, name: row.user.name, email: row.user.email, status: row.status }));
  }

  async invite(input: { email: string; displayName: string }, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const issuer = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { id: true, email: true } });
    try {
      const { invitation, token } = await this.prisma.runInTransaction(async (tx) => {
        const email = normalizeEmail(input.email);
        if (email !== issuer.email && (await this.hasManagerAssignment(tx, email))) throw alreadyManager();
        return this.invitations.create(tx, { ...input, roleKey: "MANAGER", issuer, requestId });
      });
      this.invitations.sendInvitationMail(invitation, token);
      return toInvitationView(invitation);
    } catch (error) {
      if (error instanceof AppException && error.code === "SELF_INVITE_FORBIDDEN") {
        await this.audit.record(this.prisma, {
          type: "invitation.self_invite_blocked",
          actorType: "USER",
          actorUserId: auth.userId,
          requestId,
          metadata: { role: "MANAGER" },
        });
      }
      throw error;
    }
  }

  async listInvitations(status?: InvitationStatus): Promise<InvitationView[]> {
    return (await this.invitations.list(SCOPE, status)).map((row) => toInvitationView(row));
  }

  async resend(id: string, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const { invitation, token } = await this.prisma.runInTransaction((tx) =>
      this.invitations.resend(tx, id, SCOPE, { id: auth.userId, requestId }),
    );
    this.invitations.sendInvitationMail(invitation, token);
    return toInvitationView(invitation);
  }

  async revoke(id: string, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const invitation = await this.prisma.runInTransaction((tx) =>
      this.invitations.revoke(tx, id, SCOPE, { id: auth.userId, requestId }),
    );
    return toInvitationView(invitation);
  }

  async setStatus(
    userId: string,
    to: Extract<RoleAssignmentStatus, "ACTIVE" | "INACTIVE">,
    auth: AuthContext,
    requestId: string | null,
  ): Promise<ManagerView> {
    await this.prisma.runInTransaction((tx) =>
      this.lifecycle.changeStatus(tx, userId, "MANAGER", to, auth.userId, { requestId }),
    );
    const row = await this.prisma.userRole.findFirst({
      where: { userId, role: { key: "MANAGER" } },
      select: { status: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!row) throw notFound();
    return { userId: row.user.id, name: row.user.name, email: row.user.email, status: row.status };
  }

  private async hasManagerAssignment(tx: Tx, email: string): Promise<boolean> {
    const count = await tx.userRole.count({ where: { role: { key: "MANAGER" }, user: { email } } });
    return count > 0;
  }
}
