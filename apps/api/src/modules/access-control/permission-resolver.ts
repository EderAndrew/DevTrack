import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";

/**
 * Effective permissions = union of the permissions of the user's `ACTIVE` role assignments.
 * Read from the database on every request, never cached, so a role change applies from the
 * next request on (FR-063, R9).
 */
@Injectable()
export class PermissionResolver {
  constructor(private readonly prisma: PrismaService) {}

  async effectivePermissions(userId: string, db: Tx = this.prisma): Promise<ReadonlySet<string>> {
    const rows = await db.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT p.key
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${userId}::uuid AND ur.status = 'ACTIVE'
    `;
    return new Set(rows.map((row) => row.key));
  }
}
