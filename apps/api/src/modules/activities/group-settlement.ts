import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { settleGroup } from "./group/settle-group";

/**
 * Every group route and read settles the caller's group first (023 research U9, the `ExamSettlement`
 * pattern), in its own transaction committed before the operation runs: a save then refused doesn't roll
 * the settlement back with it. Idempotent: a touch that finds the stored roles effective writes nothing.
 */
@Injectable()
export class GroupSettlement {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The group the session student takes part in, in one activity (nothing for an individual attempt). */
  ofStudent(studentUserId: string, activityId: string, now: Date, requestId: string | null): Promise<number> {
    return this.prisma.runInTransaction((tx) => settleGroup(tx, this.audit, { activityId, studentUserId, now, requestId }));
  }
}
