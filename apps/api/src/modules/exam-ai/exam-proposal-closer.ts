import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { AiProposalDecision } from "@repo/contracts";
import { derivedUuid } from "../../platform/crypto/derived-uuid";
import type { Tx } from "../../platform/database/transaction";
import { AiProposalsService } from "../ai/proposals/ai-proposals.service";
import { ExamReview, type ExamReviewChange } from "../exams/exam-review";

/**
 * The generator's proposal follows the exam's review (018 research T14, as 011 `WorkProposalCloser`):
 * when the teacher approves the generated exam, the proposal is decided in the same transaction —
 * APPROVE when every generated question is still there, APPROVE_PARTIALLY with the ones that remain,
 * REJECT when none does; a generated exam archived before any approval closes it REJECT. An expired or
 * already decided proposal stays as it is; the exam is domain data either way.
 */
@Injectable()
export class ExamProposalCloser implements OnModuleInit {
  constructor(
    private readonly review: ExamReview,
    private readonly proposals: AiProposalsService,
  ) {}

  onModuleInit(): void {
    this.review.register((tx, change) => this.close(tx, change));
  }

  async close(tx: Tx, { auth, examId, generationRequestId, requestId, now }: ExamReviewChange): Promise<void> {
    const request = await tx.examGenerationRequest.findUnique({ where: { id: generationRequestId }, select: { aiExecutionId: true } });
    if (!request?.aiExecutionId) return;
    const executionId = request.aiExecutionId;
    const proposal = await tx.aiProposal.findUnique({ where: { executionId }, select: { id: true, status: true, expiresAt: true, itemIds: true } });
    if (!proposal || proposal.status !== "READY_FOR_REVIEW" || proposal.expiresAt <= now) return;

    const exam = await tx.exam.findUniqueOrThrow({
      where: { id: examId },
      select: { status: true, archivedFromStatus: true, questions: { select: { generationItemId: true } } },
    });
    const approved = exam.status === "APPROVED" || (exam.status === "ARCHIVED" && exam.archivedFromStatus === "APPROVED");
    // Each generated question's item id is derived from its proposal item (materialize).
    const remaining = new Set(exam.questions.map((question) => question.generationItemId));
    const accepted = approved ? proposal.itemIds.filter((itemId) => remaining.has(derivedUuid(`${executionId}:${itemId}`))) : [];
    const decision: AiProposalDecision = accepted.length === proposal.itemIds.length ? "APPROVE" : accepted.length > 0 ? "APPROVE_PARTIALLY" : "REJECT";
    await this.proposals.decideWithin(tx, auth, proposal.id, decision === "APPROVE_PARTIALLY" ? { decision, acceptedItemIds: accepted } : { decision }, requestId, now);
  }
}
