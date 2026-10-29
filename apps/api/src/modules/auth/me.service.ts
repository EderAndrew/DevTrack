import { Injectable } from "@nestjs/common";
import type { MeView, RoleKey } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { PermissionResolver } from "../access-control/permission-resolver";

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolver,
  ) {}

  /** `GET /me`. `permissions` only drive the web UX; the API authorizes. */
  async get(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
        theme: true,
        roles: { select: { status: true, role: { select: { key: true } } } },
      },
    });
    // The session guard just validated this user; a concurrent purge is the only way here.
    if (!user) throw notFound();
    const permissions = await this.permissions.effectivePermissions(userId);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles
        // Role keys are seeded from ROLE_KEYS (access-control/permissions.ts), so they are RoleKey values.
        .map((assignment) => ({ key: assignment.role.key as RoleKey, status: assignment.status }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      permissions: [...permissions].sort(),
      theme: user.theme,
    };
  }
}
