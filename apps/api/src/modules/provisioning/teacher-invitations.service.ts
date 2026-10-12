import { Injectable } from "@nestjs/common";
import type { InvitationView, InviteRequest } from "@repo/contracts";
import type { InvitationStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import { alreadyTeacher, AppException, teacherReactivationRequired } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { type InvitationScope, InvitationService } from "./invitation.service";

/** The teaching registry is shared by everyone holding `professores.*` (MANAGER and ADMIN, FR-005). */
const SCOPE: InvitationScope = { roleKey: "TEACHER" };

/**
 * TEACHER invitations (FR-040, FR-040a, FR-042, FR-043). An e-mail that already has the
 * TEACHER role gets an informative refusal; any other account — a student included — goes
 * down exactly the same path as an e-mail without account, so nothing else is revealed.
 */
@Injectable()
export class TeacherInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
    private readonly audit: AuditService,
  ) {}

  async invite(input: InviteRequest, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const issuer = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { id: true, email: true } });
    try {
      const scheduled = await this.prisma.runInTransaction(async (tx) => {
        const email = normalizeEmail(input.email);
        if (email !== issuer.email) {
          const teacher = await tx.userRole.findFirst({
            where: { role: { key: "TEACHER" }, user: { email } },
            select: { status: true },
          });
          if (teacher?.status === "ACTIVE") throw alreadyTeacher();
          if (teacher) throw teacherReactivationRequired();
        }
        return this.invitations.create(tx, { ...input, roleKey: "TEACHER", issuer, requestId });
      });
      this.invitations.sendInvitationMail(scheduled);
      return await this.invitations.view(scheduled.invitation);
    } catch (error) {
      if (error instanceof AppException && error.code === "SELF_INVITE_FORBIDDEN") {
        await this.audit.record(this.prisma, {
          type: "invitation.self_invite_blocked",
          actorType: "USER",
          actorUserId: auth.userId,
          requestId,
          metadata: { role: "TEACHER" },
        });
      }
      throw error;
    }
  }

  async list(status?: InvitationStatus): Promise<InvitationView[]> {
    return this.invitations.views(await this.invitations.list(SCOPE, status));
  }

  async resend(id: string, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const scheduled = await this.prisma.runInTransaction((tx) =>
      this.invitations.resend(tx, id, SCOPE, { id: auth.userId, requestId }),
    );
    this.invitations.sendInvitationMail(scheduled);
    return this.invitations.view(scheduled.invitation);
  }

  async revoke(id: string, auth: AuthContext, requestId: string | null): Promise<InvitationView> {
    const invitation = await this.prisma.runInTransaction((tx) =>
      this.invitations.revoke(tx, id, SCOPE, { id: auth.userId, requestId }),
    );
    return this.invitations.view(invitation);
  }
}
