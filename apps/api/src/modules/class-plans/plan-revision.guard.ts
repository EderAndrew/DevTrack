import { Logger } from "@nestjs/common";
import type { Tx } from "../../platform/database/transaction";
import { planArchived, planRevisionConflict } from "../../platform/http/errors";

const logger = new Logger("ClassPlans");

/**
 * Starts every write to a class plan (004 research E13, FR-041): one conditional `UPDATE` bumps
 * the revision only when it still is `planRevision` and the plan is not archived, and holds the
 * plan row for the rest of the transaction. No row → `409 PLAN_ARCHIVED` when the plan is
 * archived, otherwise `409 PLAN_REVISION_CONFLICT` (logged, not audited: FR-048).
 * Returns the new revision.
 */
export async function bumpRevision(tx: Tx, planId: string, planRevision: number): Promise<number> {
  const [bumped] = await tx.$queryRaw<{ revision: number }[]>`
    UPDATE class_plans SET revision = revision + 1, updated_at = now()
    WHERE id = ${planId}::uuid AND revision = ${planRevision} AND status <> 'ARCHIVED'
    RETURNING revision`;
  if (bumped) return bumped.revision;

  const plan = await tx.classPlan.findUniqueOrThrow({ where: { id: planId }, select: { status: true, revision: true } });
  if (plan.status === "ARCHIVED") throw planArchived();
  logger.warn({ planId, expected: planRevision, current: plan.revision }, "class_plan.revision_conflict");
  throw planRevisionConflict();
}
