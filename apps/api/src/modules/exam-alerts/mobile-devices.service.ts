import { Injectable } from "@nestjs/common";
import type { MobileDevice, RegisterMobileDeviceRequest } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import { notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { MobileWriteLimit } from "../../platform/http/mobile-write-limit";

/**
 * The phone's registration for alerts (024/FR-018, research Y9, contracts/audit-events.md): one device per
 * MOBILE session, the push token unique. `PUT /mobile/device` upserts the current session's row; the same
 * token again changes nothing; a token linked to another session (another account signed in on the same
 * phone) moves here, the old link removed `REPLACED`. Under an advisory lock on the token, so two sessions
 * racing for one token end with one owner. The token is never returned, audited or logged.
 */
@Injectable()
export class MobileDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limit: MobileWriteLimit,
  ) {}

  async register(auth: AuthContext, body: RegisterMobileDeviceRequest, requestId: string | null): Promise<MobileDevice> {
    if (auth.client !== "MOBILE") throw notFound();
    return this.prisma.runInTransaction(async (tx) => {
      await this.limit.assert(tx, auth.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mobile-device'), hashtext(${body.pushToken}))`;
      const holder = await tx.mobileDevice.findUnique({ where: { pushToken: body.pushToken }, select: { id: true, sessionId: true, platform: true } });
      if (holder?.sessionId === auth.sessionId) {
        if (holder.platform !== body.platform) await tx.mobileDevice.update({ where: { id: holder.id }, data: { platform: body.platform } });
        return { id: holder.id, platform: body.platform };
      }

      if (holder) {
        await tx.mobileDevice.delete({ where: { id: holder.id } });
        await this.audit.record(tx, {
          type: "mobile_device.removed",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "MOBILE_DEVICE",
          targetId: holder.id,
          requestId,
          metadata: { reason: "REPLACED" },
        });
      }

      const current = await tx.mobileDevice.findUnique({ where: { sessionId: auth.sessionId }, select: { id: true } });
      const device = current
        ? await tx.mobileDevice.update({ where: { id: current.id }, data: { pushToken: body.pushToken, platform: body.platform }, select: { id: true } })
        : await tx.mobileDevice.create({
            data: { sessionId: auth.sessionId, userId: auth.userId, pushToken: body.pushToken, platform: body.platform },
            select: { id: true },
          });
      // A new link (a first device, or a token taken from another session) is audited; a token refreshed by
      // the same session is not.
      if (!current || holder) {
        await this.audit.record(tx, {
          type: "mobile_device.registered",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "MOBILE_DEVICE",
          targetId: device.id,
          requestId,
          metadata: { sessionId: auth.sessionId, platform: body.platform },
        });
      }
      return { id: device.id, platform: body.platform };
    });
  }
}
