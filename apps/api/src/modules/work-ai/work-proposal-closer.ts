import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { AiProposalDecision } from "@repo/contracts";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import type { Tx } from "../../platform/database/transaction";
import { AiProposalsService } from "../ai/proposals/ai-proposals.service";
import { WorkReview, type WorkReviewChange } from "../works/work-review";

/**
 * The generator's proposal follows the work's review (011 research W10): when the teacher approves
 * the generated work, the proposal is decided in the same transaction — APPROVE when every
 * generated question is still there, APPROVE_PARTIALLY with the ones that remain, REJECT when none
 * does; an archived work that was never approved closes it REJECT. An expired or already decided
 * proposal stays as it is; the work is domain data either way.
 */
@Injectable()
export class WorkProposalCloser implements OnModuleInit {
  constructor(
    private readonly review: WorkReview,
    private readonly proposals: AiProposalsService,
  ) {}

  onModuleInit(): void {
    this.review.register((tx, change) => this.close(tx, change));
  }

  async close(
    tx: Tx,
    { auth, workId, generationRequestId, requestId, now }: WorkReviewChange,
  ): Promise<void> {
    const request = await tx.workGenerationRequest.findUnique({
      where: { id: generationRequestId },
      select: { aiExecutionId: true },
    });
    if (!request?.aiExecutionId) return;
    const executionId = request.aiExecutionId;
    const proposal = await tx.aiProposal.findUnique({
      where: { executionId },
      select: { id: true, status: true, expiresAt: true, itemIds: true },
    });
    if (
      !proposal ||
      proposal.status !== "READY_FOR_REVIEW" ||
      proposal.expiresAt <= now
    )
      return;

    const work = await tx.work.findUniqueOrThrow({
      where: { id: workId },
      select: {
        status: true,
        archivedFromStatus: true,
        questions: { select: { generationItemId: true } },
      },
    });
    const approved =
      work.status === "APPROVED" ||
      (work.status === "ARCHIVED" && work.archivedFromStatus === "APPROVED");
    // Each generated question's item id is derived from its proposal item (materialize).
    const remaining = new Set(
      work.questions.map((question) => question.generationItemId),
    );
    const accepted = approved
      ? proposal.itemIds.filter((itemId) =>
          remaining.has(derivedUuid(`${executionId}:${itemId}`)),
        )
      : [];
    const decision: AiProposalDecision =
      accepted.length === proposal.itemIds.length
        ? "APPROVE"
        : accepted.length > 0
          ? "APPROVE_PARTIALLY"
          : "REJECT";
    await this.proposals.decideWithin(
      tx,
      auth,
      proposal.id,
      decision === "APPROVE_PARTIALLY"
        ? { decision, acceptedItemIds: accepted }
        : { decision },
      requestId,
      now,
    );
  }
}
