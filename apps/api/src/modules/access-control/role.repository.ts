import { Injectable } from "@nestjs/common";
import type { GrantSource, Role, UserRole } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import type { RoleKey } from "./permissions";

export type AssignmentWithRole = UserRole & { role: Role };

export interface GrantResult {
  assignment: AssignmentWithRole;
  /** false when the user already had an assignment of this role (in any status). */
  created: boolean;
}

@Injectable()
export class RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Roles are reference data seeded by migration; a missing key is a deployment error. */
  findByKey(key: RoleKey, db: Tx = this.prisma): Promise<Role> {
    return db.role.findUniqueOrThrow({ where: { key } });
  }

  getAssignment(userId: string, roleKey: RoleKey, db: Tx = this.prisma): Promise<AssignmentWithRole | null> {
    return db.userRole.findFirst({ where: { userId, role: { key: roleKey } }, include: { role: true } });
  }

  /**
   * Grants `roleKey` as `ACTIVE`. Idempotent under concurrency through `UNIQUE(userId, roleId)`
   * (`ON CONFLICT DO NOTHING`): an existing assignment is returned untouched, whatever its
   * status — reactivation is a lifecycle transition, not a grant (FR-044).
   */
  async grant(
    tx: Tx,
    userId: string,
    roleKey: RoleKey,
    grantedById: string | null,
    via: GrantSource,
  ): Promise<GrantResult> {
    const role = await this.findByKey(roleKey, tx);
    const { count } = await tx.userRole.createMany({
      data: [{ userId, roleId: role.id, status: "ACTIVE", grantedById, grantedVia: via }],
      skipDuplicates: true,
    });
    const assignment = await tx.userRole.findUniqueOrThrow({
      where: { userId_roleId: { userId, roleId: role.id } },
      include: { role: true },
    });
    return { assignment, created: count === 1 };
  }
}
