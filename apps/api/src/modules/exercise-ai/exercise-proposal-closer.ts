import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { AiProposalDecision } from "@repo/contracts";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import type { Tx } from "../../platform/database/transaction";
import { AiProposalsService } from "../ai/proposals/ai-proposals.service";
import { type BatchReviewChange, ExerciseBatchReview } from "../exercises/batch-review";

/**
 * The generator's proposal follows the batch review (010 research X15): when the last DRAFT of a
 * generated batch is approved, discarded or archived, the proposal is decided in the same transaction —
 * APPROVE when every item was approved, APPROVE_PARTIALLY with the approved ones, REJECT with none.
 * An expired or already decided proposal stays as it is; the drafts are domain data either way.
 */
@Injectable()
export class ExerciseProposalCloser implements OnModuleInit {
  constructor(
    private readonly review: ExerciseBatchReview,
    private readonly proposals: AiProposalsService,
  ) {}

  onModuleInit(): void {
    this.review.register((tx, change) => this.close(tx, change));
  }

  async close(tx: Tx, { auth, batchId, requestId, now }: BatchReviewChange): Promise<void> {
    const batch = await tx.exerciseGenerationBatch.findUnique({
      where: { id: batchId },
      select: { aiExecutionId: true, generatedAt: true, _count: { select: { exercises: { where: { status: "DRAFT" } } } } },
    });
    if (!batch?.aiExecutionId || !batch.generatedAt || batch._count.exercises > 0) return;
    const executionId = batch.aiExecutionId;
    const proposal = await tx.aiProposal.findUnique({ where: { executionId }, select: { id: true, status: true, expiresAt: true, itemIds: true } });
    if (!proposal || proposal.status !== "READY_FOR_REVIEW" || proposal.expiresAt <= now) return;

    // Approved, or approved and archived since: each draft's item id is derived from its proposal item (materialize).
    const approved = await tx.exercise.findMany({
      where: { generationBatchId: batchId, OR: [{ status: "APPROVED" }, { status: "ARCHIVED", archivedFromStatus: "APPROVED" }] },
      select: { generationItemId: true },
    });
    const approvedItems = new Set(approved.map((row) => row.generationItemId));
    const accepted = proposal.itemIds.filter((itemId) => approvedItems.has(derivedUuid(`${executionId}:${itemId}`)));
    const decision: AiProposalDecision =
      accepted.length === proposal.itemIds.length ? "APPROVE" : accepted.length > 0 ? "APPROVE_PARTIALLY" : "REJECT";
    await this.proposals.decideWithin(
      tx,
      auth,
      proposal.id,
      decision === "APPROVE_PARTIALLY" ? { decision, acceptedItemIds: accepted } : { decision },
      requestId,
      now,
    );
  }
}
