import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import { PermissionResolver } from "../access-control/permission-resolver";

/** `GET /me` (contracts/http-api.md). `permissions` only drive the web UX; the API authorizes. */
export interface MeView {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  roles: { key: string; status: "ACTIVE" | "SUSPENDED" | "INACTIVE" }[];
  permissions: string[];
}

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionResolver,
  ) {}

  async get(userId: string): Promise<MeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerifiedAt: true,
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
        .map((assignment) => ({ key: assignment.role.key, status: assignment.status }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      permissions: [...permissions].sort(),
    };
  }
}
