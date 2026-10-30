import type { ErrorCode } from "@repo/contracts";
import { AppException } from "../../platform/http/errors";
import type { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../../platform/database/prisma.service";

/** What a group member tried (023 contracts/audit-events.md, `activity_group.write_refused`). */
export type GroupWriteOperation = "SAVE" | "SUBMIT" | "EDITING" | "ADD_MEMBERS";
/** Why: the caller isn't the effective editor or the leader; or, adding members, the group is full or a classmate unavailable. */
export type GroupRefusalReason = "NOT_EDITOR" | "NOT_LEADER" | "FULL" | "MEMBERS_UNAVAILABLE";

const CODES: Record<GroupRefusalReason, ErrorCode> = {
  NOT_EDITOR: "GROUP_NOT_EDITOR",
  NOT_LEADER: "GROUP_NOT_LEADER",
  FULL: "GROUP_FULL",
  MEMBERS_UNAVAILABLE: "GROUP_MEMBERS_UNAVAILABLE",
};

/**
 * A group write refused to its author (023 research U8): thrown inside the operation's transaction, so
 * nothing of it commits; `recordGroupRefusal` then audits it on its own and answers the 409.
 */
export class GroupRefused extends Error {
  constructor(
    readonly operation: GroupWriteOperation,
    readonly reason: GroupRefusalReason,
    readonly activityId: string,
    readonly attemptId: string,
    /** `MEMBERS_UNAVAILABLE`: the chosen ids no longer eligible, for the error's `details`. */
    readonly unavailableIds?: readonly string[],
  ) {
    super(CODES[reason]);
  }
}

/** `activity_group.write_refused` after the rollback (ids and codes only), then the 409 to throw. */
export async function recordGroupRefusal(
  prisma: PrismaService,
  audit: AuditService,
  studentUserId: string,
  error: GroupRefused,
  requestId: string | null,
): Promise<AppException> {
  await audit.record(prisma, {
    type: "activity_group.write_refused",
    actorType: "USER",
    actorUserId: studentUserId,
    targetType: "ACTIVITY_ATTEMPT",
    targetId: error.attemptId,
    requestId,
    metadata: { activityId: error.activityId, attemptId: error.attemptId, operation: error.operation, reason: error.reason },
  });
  return error.unavailableIds
    ? new AppException(CODES[error.reason], undefined, {}, { unavailableIds: [...error.unavailableIds] })
    : new AppException(CODES[error.reason]);
}
