import type { Tx } from "../../../platform/database/transaction";
import type { ProposalRejectedContext } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { EXAM_GENERATION_REQUEST } from "./request-content";

/**
 * `proposal.rejected` of `exam-generator` (018/US7-2): the output was refused, so nothing was saved;
 * the request's refusal is audited `exam_generation.rejected` with the code, never content.
 */
export async function recordRejectedExamGeneration(tx: Tx, context: ProposalRejectedContext): Promise<void> {
  if (context.resource?.type !== EXAM_GENERATION_REQUEST) return;
  await context.get(AuditService).record(tx, {
    type: "exam_generation.rejected",
    actorType: "SYSTEM",
    targetType: "EXAM_GENERATION_REQUEST",
    targetId: context.resource.id,
    metadata: { aiExecutionId: context.executionId, code: context.reason },
  });
}
