import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import {
  deleteInBatches,
  type MaintenanceJob,
  type MaintenanceJobContext,
  MaintenanceService,
} from "../../platform/maintenance/maintenance.service";
import { SESSION_LIFETIMES } from "../auth/session.service";

/**
 * Deletes the devices whose MOBILE session has expired (024 contracts/configuration.md, research Y9): past
 * its absolute end or idle for longer than the MOBILE idle time, by the run's `now`. A revoked session lost
 * its device in the revocation's transaction, so only expiry is left here. Such a device already received
 * nothing (`AlertRecipients` reads the session at send time); this only removes the token. No audit event,
 * only the count is logged.
 */
@Injectable()
export class MobileDevicesRetentionJob implements MaintenanceJob, OnModuleInit {
  readonly name = "mobile-devices";

  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  onModuleInit(): void {
    this.maintenance.register(this);
  }

  run({ now, batchSize }: MaintenanceJobContext): Promise<number> {
    const idleCutoff = new Date(now.getTime() - SESSION_LIFETIMES.MOBILE.idleMs);
    return deleteInBatches(batchSize, () =>
      this.prisma.runInTransaction((tx) =>
        tx.$executeRaw`
          DELETE FROM mobile_devices
          WHERE id IN (
            SELECT d.id FROM mobile_devices d
            JOIN sessions s ON s.id = d.session_id
            WHERE s.absolute_expires_at <= ${now}::timestamptz OR s.last_used_at <= ${idleCutoff}::timestamptz
            ORDER BY d.id
            LIMIT ${batchSize}
            FOR UPDATE OF d SKIP LOCKED
          )`,
      ),
    );
  }
}
