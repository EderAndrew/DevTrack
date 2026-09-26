import type { AiErrorCode, AiExecutionSummary, AiExecutionView } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";

export const EXECUTION_SUMMARY_INCLUDE = {
  agentVersionRef: { select: { agent: { select: { name: true } } } },
  proposal: { select: { id: true } },
} satisfies Prisma.AiExecutionInclude;

export const EXECUTION_VIEW_INCLUDE = {
  ...EXECUTION_SUMMARY_INCLUDE,
  transitions: { orderBy: { id: "asc" } },
} satisfies Prisma.AiExecutionInclude;

type SummaryRow = Prisma.AiExecutionGetPayload<{ include: typeof EXECUTION_SUMMARY_INCLUDE }>;
type ViewRow = Prisma.AiExecutionGetPayload<{ include: typeof EXECUTION_VIEW_INCLUDE }>;

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * Never the provider, model, instructions, input nor provider messages (006 FR-026, FR-066).
 * `completedAt` and `failedAt` derive from `finished_at` and the status (research A8).
 */
export function toExecutionSummary(row: SummaryRow): AiExecutionSummary {
  return {
    id: row.id,
    agent: { key: row.agentKey, name: row.agentVersionRef.agent.name, version: row.agentVersion },
    status: row.status,
    riskLevel: row.riskLevel,
    resource: row.resourceType && row.resourceId ? { type: row.resourceType, id: row.resourceId } : null,
    errorCode: (row.errorCode as AiErrorCode | null) ?? null,
    cancelRequested: row.cancelRequestedAt !== null && row.status !== "CANCELLED",
    proposalId: row.proposal?.id ?? null,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    completedAt: row.status === "COMPLETED" ? iso(row.finishedAt) : null,
    failedAt: row.status === "FAILED" || row.status === "TIMED_OUT" ? iso(row.finishedAt) : null,
    durationMs: row.durationMs,
  };
}

export function toExecutionView(row: ViewRow): AiExecutionView {
  return {
    ...toExecutionSummary(row),
    transitions: row.transitions.map((transition) => ({
      from: transition.fromStatus,
      to: transition.toStatus,
      at: transition.occurredAt.toISOString(),
    })),
  };
}
