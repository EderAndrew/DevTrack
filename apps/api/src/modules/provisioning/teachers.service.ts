import { Injectable } from "@nestjs/common";
import type { TeacherListItem, TeacherStatus, TeacherView } from "@repo/contracts";
import type { RoleAssignmentStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { AuthContext } from "../../platform/http/request-context";
import { findOwnedOrNotFound } from "../access-control/resource-context";
import { RoleLifecycleService } from "../access-control/role-lifecycle.service";
import { InvitationService } from "./invitation.service";
import { INVITATION_INCLUDE } from "./invitation.view";

const TEACHER_ASSIGNMENT_SELECT = {
  status: true,
  user: { select: { id: true, email: true, teacherProfile: { select: { displayName: true } } } },
} as const;

type AssignmentRow = {
  status: RoleAssignmentStatus;
  user: { id: string; email: string; teacherProfile: { displayName: string } | null };
};

/** Teaching name only: the profile's (or the e-mail when a profile is somehow missing), never `User.name`. */
const teachingName = (row: AssignmentRow) => row.user.teacherProfile?.displayName ?? row.user.email;

/**
 * The teaching registry (FR-050, FR-051). Every lookup is scoped to identities holding a
 * `TEACHER` assignment, so a student (or any other account) is simply not found (404).
 * Status changes go through `RoleLifecycleService` and touch only the TEACHER role.
 */
@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: RoleLifecycleService,
    private readonly invitationService: InvitationService,
  ) {}

  /** Teacher lifecycle as seen by MANAGER (FR-051, FR-007): INVITED is derived, never stored. */
  async list(status?: TeacherStatus): Promise<TeacherListItem[]> {
    const items: TeacherListItem[] = [];

    if (status !== "INVITED") {
      const assignments = await this.prisma.userRole.findMany({
        where: { role: { key: "TEACHER" }, ...(status ? { status } : {}) },
        select: TEACHER_ASSIGNMENT_SELECT,
      });
      for (const row of assignments) {
        items.push({
          userId: row.user.id,
          invitationId: null,
          displayName: teachingName(row),
          email: row.user.email,
          status: row.status,
        });
      }
    }

    if (!status || status === "INVITED") {
      const invited = await this.prisma.invitation.findMany({
        where: {
          role: { key: "TEACHER" },
          status: "PENDING",
          expiresAt: { gt: new Date() },
          // Only e-mails without a TEACHER assignment are "invited"; others already have a status.
          NOT: { email: { in: await this.teacherEmails() } },
        },
        select: { id: true, email: true, displayName: true },
      });
      for (const invitation of invited) {
        items.push({
          userId: null,
          invitationId: invitation.id,
          displayName: invitation.displayName,
          email: invitation.email,
          status: "INVITED",
        });
      }
    }

    return items.sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR") || a.email.localeCompare(b.email));
  }

  async get(userId: string): Promise<TeacherView> {
    const row = await findOwnedOrNotFound(() =>
      this.prisma.userRole.findFirst({
        where: { userId, role: { key: "TEACHER" } },
        select: TEACHER_ASSIGNMENT_SELECT,
      }),
    );
    const invitations = await this.prisma.invitation.findMany({
      where: { email: row.user.email, role: { key: "TEACHER" } },
      include: INVITATION_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return {
      userId: row.user.id,
      displayName: teachingName(row),
      email: row.user.email,
      status: row.status,
      invitations: await this.invitationService.views(invitations),
    };
  }

  async setStatus(
    userId: string,
    to: RoleAssignmentStatus,
    auth: AuthContext,
    requestId: string | null,
  ): Promise<TeacherView> {
    await this.prisma.runInTransaction((tx) =>
      this.lifecycle.changeStatus(tx, userId, "TEACHER", to, auth.userId, { requestId }),
    );
    return this.get(userId);
  }

  private async teacherEmails(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { roles: { some: { role: { key: "TEACHER" } } } },
      select: { email: true },
    });
    return rows.map((row) => row.email);
  }
}
