import { Injectable } from "@nestjs/common";
import type { RoleAssignmentStatus } from "../../generated/prisma/client";
import { advisoryXactLock, LockKey, type Tx } from "../../platform/database/transaction";
import { lastAdminProtected, notFound } from "../../platform/http/errors";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/session.service";
import type { RoleKey } from "./permissions";
import { RoleAssignmentStateMachine } from "./role-assignment.state-machine";
import type { AssignmentWithRole } from "./role.repository";

export interface ChangeStatusOptions {
  requestId?: string | null;
}

export interface ChangeStatusResult {
  assignment: AssignmentWithRole;
  from: RoleAssignmentStatus;
  revokedSessions: number;
}

/**
 * Status changes of role assignments (FR-051, FR-054, Principle XVI). Everything happens in
 * the caller's transaction: row lock, transition check, last-ADMIN guard, session revocation
 * and audit commit or roll back together.
 *
 * A refused change throws `409 LAST_ADMIN_PROTECTED`, which rolls the transaction back; callers
 * that must audit `account.last_admin_protected` do so in a separate transaction.
 */
@Injectable()
export class RoleLifecycleService {
  constructor(
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async changeStatus(
    tx: Tx,
    userId: string,
    roleKey: RoleKey,
    to: RoleAssignmentStatus,
    actorId: string,
    options: ChangeStatusOptions = {},
  ): Promise<ChangeStatusResult> {
    // Always the same lock order (advisory, then row) so concurrent changes cannot deadlock.
    if (roleKey === "ADMIN") await advisoryXactLock(tx, LockKey.ADMIN_GUARD_LOCK);

    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT ur.id
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${userId}::uuid AND r.key = ${roleKey}
      FOR UPDATE OF ur
    `;
    const assignmentId = locked[0]?.id;
    if (!assignmentId) throw notFound();

    const current = await tx.userRole.findUniqueOrThrow({ where: { id: assignmentId }, include: { role: true } });
    const from = current.status;
    RoleAssignmentStateMachine.assertTransition(from, to);

    const leavesActive = from === "ACTIVE";
    if (roleKey === "ADMIN" && leavesActive) await this.assertAnotherActiveAdmin(tx, userId);

    const assignment = await tx.userRole.update({
      where: { id: assignmentId },
      data: { status: to, statusChangedAt: new Date(), statusChangedById: actorId },
      include: { role: true },
    });

    let revokedSessions = 0;
    if (leavesActive && current.role.privileged) {
      revokedSessions = await this.sessions.revokeAllForUser(tx, userId, "ROLE_DEACTIVATED");
      if (revokedSessions > 0) {
        await this.audit.record(tx, {
          type: "session.revoked_all",
          actorType: "USER",
          actorUserId: actorId,
          targetType: "USER",
          targetId: userId,
          requestId: options.requestId,
          metadata: { reason: "ROLE_DEACTIVATED", count: revokedSessions },
        });
      }
    }

    await this.audit.record(tx, {
      type: "role.status_changed",
      actorType: "USER",
      actorUserId: actorId,
      targetType: "USER_ROLE",
      targetId: assignmentId,
      requestId: options.requestId,
      metadata: { userId, role: roleKey, from, to },
    });

    return { assignment, from, revokedSessions };
  }

  /**
   * Last-ADMIN guard (FR-054): refuses when no other user would keep an `ACTIVE` ADMIN role on
   * an `ACTIVE` account. Takes `ADMIN_GUARD_LOCK`, so it also serves account suspension.
   */
  async assertAnotherActiveAdmin(tx: Tx, excludingUserId: string): Promise<void> {
    await advisoryXactLock(tx, LockKey.ADMIN_GUARD_LOCK);
    const others = await tx.userRole.count({
      where: {
        userId: { not: excludingUserId },
        status: "ACTIVE",
        role: { key: "ADMIN" },
        user: { status: "ACTIVE" },
      },
    });
    if (others === 0) throw lastAdminProtected();
  }
}
