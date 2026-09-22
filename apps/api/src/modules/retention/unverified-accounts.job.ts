import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";
import { AuditService } from "../audit/audit.service";

/** FR-017: never-verified accounts are deleted 7 days after creation. */
export const UNVERIFIED_ACCOUNT_TTL_DAYS = 7;

export function unverifiedAccountCutoff(now: Date): Date {
  return new Date(now.getTime() - UNVERIFIED_ACCOUNT_TTL_DAYS * 24 * 3600 * 1000);
}

/**
 * Deletes accounts whose e-mail was never verified (FR-017, R23). Eligible: unverified,
 * created before the cutoff, whose only role assignment is `STUDENT` (any status), that never
 * accepted an invitation and that no other row points at as actor. Each batch locks its rows
 * (`FOR UPDATE SKIP LOCKED`, so concurrent runs split the work), deletes sessions, tokens,
 * profile, role and user, and records one `account.unverified_purged` per id — no name or
 * e-mail. `admin_bootstraps.target_user_id` is cleared by its `ON DELETE SET NULL`.
 */
@Injectable()
export class UnverifiedAccountsJob implements MaintenanceJob, OnModuleInit {
  readonly name = "unverified-accounts";

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const cutoff = unverifiedAccountCutoff(now);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT u.id FROM users u
          WHERE u.email_verified_at IS NULL
            AND u.created_at < ${cutoff}::timestamptz
            AND (SELECT array_agg(r.key) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                 WHERE ur.user_id = u.id) = ARRAY['STUDENT']::text[]
            AND NOT EXISTS (SELECT 1 FROM invitations i
                            WHERE i.accepted_by_user_id = u.id OR i.invited_by_id = u.id OR i.revoked_by_id = u.id)
            AND NOT EXISTS (SELECT 1 FROM user_roles ur
                            WHERE ur.user_id <> u.id AND (ur.granted_by_id = u.id OR ur.status_changed_by_id = u.id))
          ORDER BY u.created_at, u.id
          LIMIT ${batchSize}
          FOR UPDATE OF u SKIP LOCKED`;
        const ids = rows.map((row) => row.id);
        if (ids.length === 0) return 0;

        await tx.session.deleteMany({ where: { userId: { in: ids } } });
        await tx.userToken.deleteMany({ where: { userId: { in: ids } } });
        await tx.studentProfile.deleteMany({ where: { userId: { in: ids } } });
        await tx.userRole.deleteMany({ where: { userId: { in: ids } } });
        await tx.user.deleteMany({ where: { id: { in: ids }, emailVerifiedAt: null } });
        for (const id of ids) {
          await this.audit.record(tx, {
            type: "account.unverified_purged",
            actorType: "SYSTEM",
            targetType: "USER",
            targetId: id,
          });
        }
        return ids.length;
      }),
    );
  }
}
