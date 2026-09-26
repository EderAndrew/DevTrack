import type { AiProposalSummary, AiProposalView } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";

export const PROPOSAL_INCLUDE = {
  agentVersion: { select: { version: true, agent: { select: { name: true } } } },
} satisfies Prisma.AiProposalInclude;

type ProposalRow = Prisma.AiProposalGetPayload<{ include: typeof PROPOSAL_INCLUDE }>;

/**
 * A proposal is a SUGGESTION and the teacher's choice a HUMAN_DECISION (constitution XI); the
 * summary never carries the proposed content (contracts/http-api.md).
 */
export function toProposalSummary(row: ProposalRow): AiProposalSummary {
  return {
    id: row.id,
    executionId: row.executionId,
    agent: { key: row.agentKey, name: row.agentVersion.agent.name, version: row.agentVersion.version },
    proposalType: row.proposalType,
    target: { type: row.targetResourceType, id: row.targetResourceId },
    status: row.status,
    nature: "SUGGESTION",
    itemIds: row.itemIds,
    acceptedItemIds: row.status === "PARTIALLY_APPROVED" ? row.acceptedItemIds : null,
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decision: row.decidedByUserId ? { nature: "HUMAN_DECISION", byUserId: row.decidedByUserId } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toProposalView(row: ProposalRow): AiProposalView {
  return { ...toProposalSummary(row), content: row.payload };
}
