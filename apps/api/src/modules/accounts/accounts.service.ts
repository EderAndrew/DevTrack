import { Injectable } from "@nestjs/common";
import type { AccountPage, AccountStatus, RoleKey, UserAccountView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { afterCursor, decodeCursor, encodeCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  AppException,
  invalidStateTransition,
  notFound,
  selfActionForbidden,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { RoleLifecycleService } from "../access-control/role-lifecycle.service";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/session.service";
import { UserRepository } from "../identity/user.repository";

export const ACCOUNTS_PAGE_SIZE = 50;

const SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  status: true,
  createdAt: true,
  roles: { select: { status: true, role: { select: { key: true } } } },
} as const satisfies Prisma.UserSelect;

type AccountRow = Prisma.UserGetPayload<{ select: typeof SELECT }>;

/** `UserAccountView` of the contract: identity only, never academic data (FR-056); dates as ISO (002 S4). */
function toView(row: AccountRow): UserAccountView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    status: row.status,
    roles: row.roles
      // Role keys are seeded from ROLE_KEYS (access-control/permissions.ts), so they are RoleKey values.
      .map((assignment) => ({ key: assignment.role.key as RoleKey, status: assignment.status }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * ADMIN's identity-level view and control of accounts (FR-052, FR-054, FR-056). Suspension
 * revokes every session; the last active ADMIN account can never be suspended, and nobody
 * suspends their own account.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly lifecycle: RoleLifecycleService,
    private readonly audit: AuditService,
  ) {}

  async list({ query, cursor }: { query?: string; cursor?: string }): Promise<AccountPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const where: Prisma.UserWhereInput = {
      ...(query?.trim()
        ? {
            OR: [
              { name: { contains: escapeLike(query.trim()), mode: "insensitive" } },
              { email: { contains: escapeLike(query.trim()), mode: "insensitive" } },
            ],
          }
        : {}),
      ...(after ? { AND: [afterCursor(after)] } : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      select: SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ACCOUNTS_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, ACCOUNTS_PAGE_SIZE);
    return {
      items: page.map(toView),
      nextCursor: rows.length > ACCOUNTS_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  async get(id: string): Promise<UserAccountView> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!row) throw notFound();
    return toView(row);
  }

  async suspend(id: string, auth: AuthContext, requestId: string | null): Promise<UserAccountView> {
    if (id === auth.userId) throw selfActionForbidden();
    try {
      await this.prisma.runInTransaction(async (tx) => {
        const [target] = await tx.$queryRaw<{ status: AccountStatus }[]>`
          SELECT status FROM users WHERE id = ${id}::uuid FOR UPDATE`;
        if (!target) throw notFound();
        if (target.status === "SUSPENDED") throw invalidStateTransition();

        const isActiveAdmin = await tx.userRole.count({
          where: { userId: id, status: "ACTIVE", role: { key: "ADMIN" } },
        });
        if (isActiveAdmin > 0) await this.lifecycle.assertAnotherActiveAdmin(tx, id);

        await this.users.setStatus(tx, id, "SUSPENDED");
        const count = await this.sessions.revokeAllForUser(tx, id, "ACCOUNT_SUSPENDED");
        if (count > 0) {
          await this.audit.record(tx, {
            type: "session.revoked_all",
            actorType: "USER",
            actorUserId: auth.userId,
            targetType: "USER",
            targetId: id,
            requestId,
            metadata: { reason: "ACCOUNT_SUSPENDED", count },
          });
        }
        await this.audit.record(tx, {
          type: "account.suspended",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "USER",
          targetId: id,
          requestId,
        });
      });
    } catch (error) {
      if (error instanceof AppException && error.code === "LAST_ADMIN_PROTECTED") {
        // The refused operation rolled back; its audit record commits on its own (FR-054, FR-070).
        await this.audit.record(this.prisma, {
          type: "account.last_admin_protected",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "USER",
          targetId: id,
          requestId,
          metadata: { operation: "SUSPEND" },
        });
      }
      throw error;
    }
    return this.get(id);
  }

  async reactivate(id: string, auth: AuthContext, requestId: string | null): Promise<UserAccountView> {
    await this.prisma.runInTransaction(async (tx) => {
      const [target] = await tx.$queryRaw<{ status: AccountStatus }[]>`
        SELECT status FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      if (!target) throw notFound();
      if (target.status !== "SUSPENDED") throw invalidStateTransition();
      await this.users.setStatus(tx, id, "ACTIVE");
      await this.audit.record(tx, {
        type: "account.reactivated",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "USER",
        targetId: id,
        requestId,
      });
    });
    return this.get(id);
  }
}
