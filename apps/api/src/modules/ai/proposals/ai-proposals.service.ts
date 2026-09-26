import { Inject, Injectable } from "@nestjs/common";
import type { AiProposalListQuery, AiProposalPage, AiProposalStatus, AiProposalView, DecideAiProposalRequest } from "@repo/contracts";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { afterCursor, decodeCursor, encodeCursor } from "../../../platform/database/keyset";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AppException, invalidStateTransition, notFound, rateLimited } from "../../../platform/http/errors";
import type { AuthContext } from "../../../platform/http/request-context";
import { RateLimitService } from "../../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.service";
import { AiProposalStateMachine } from "./ai-proposal.state-machine";
import { PROPOSAL_INCLUDE, toProposalSummary, toProposalView } from "./ai-proposal.view";

const PAGE_SIZE = 50;

const STATUS_OF = {
  APPROVE: "APPROVED",
  APPROVE_PARTIALLY: "PARTIALLY_APPROVED",
  REJECT: "REJECTED",
} as const satisfies Record<DecideAiProposalRequest["decision"], AiProposalStatus>;

const AUDIT_OF = {
  APPROVED: "ai_proposal.approved",
  PARTIALLY_APPROVED: "ai_proposal.partially_approved",
  REJECTED: "ai_proposal.rejected",
} as const;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item) => b.includes(item));

/**
 * Proposals of L2 agents and the teacher's decision (006 US5, research A13). Every lookup is by
 * `(id, workspace_id)`; a decision is one conditional UPDATE, so exactly one wins (FR-045), and the
 * same decision again returns the same proposal. Deciding never touches the domain (FR-044):
 * domain modules read an approved proposal through `getApproved` and apply it in their own flow.
 */
@Injectable()
export class AiProposalsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async list(workspaceId: string, query: AiProposalListQuery): Promise<AiProposalPage> {
    const rows = await this.prisma.aiProposal.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? afterCursor(decodeCursor(query.cursor)) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: PROPOSAL_INCLUDE,
    });
    const page = rows.slice(0, PAGE_SIZE);
    return { items: page.map(toProposalSummary), nextCursor: rows.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]!) : null };
  }

  async get(workspaceId: string, id: string): Promise<AiProposalView> {
    const row = await this.prisma.aiProposal.findFirst({ where: { id, workspaceId }, include: PROPOSAL_INCLUDE });
    if (!row) throw notFound();
    return toProposalView(row);
  }

  /** For domain modules (research A3): an APPROVED or PARTIALLY_APPROVED proposal of the workspace, else 404/409. */
  async getApproved(workspaceId: string, id: string): Promise<AiProposalView> {
    const view = await this.get(workspaceId, id);
    if (view.status !== "APPROVED" && view.status !== "PARTIALLY_APPROVED") throw invalidStateTransition();
    return view;
  }

  async decide(auth: AuthContext, id: string, body: DecideAiProposalRequest, requestId: string | null, now = new Date()): Promise<AiProposalView> {
    const workspaceId = auth.userId;
    const limit = await this.rateLimit.hit("ai-decision", workspaceId, { limit: this.config.rateLimit.aiDecisionsPerMinute, windowSec: 60 });
    if (limit.blocked) {
      await this.audit.record(this.prisma, {
        type: "ai_execution.rate_limited",
        actorType: "USER",
        actorUserId: workspaceId,
        requestId,
        metadata: { scope: "ai-decision" },
      });
      throw rateLimited(limit.retryAfterSec);
    }

    const current = await this.prisma.aiProposal.findFirst({ where: { id, workspaceId }, select: { itemIds: true } });
    if (!current) throw notFound();
    const to = STATUS_OF[body.decision];
    const accepted = body.acceptedItemIds ?? [];
    if (to === "PARTIALLY_APPROVED" && (!accepted.every((item) => current.itemIds.includes(item)) || sameSet(accepted, current.itemIds))) {
      throw new AppException("AI_PROPOSAL_ITEMS_INVALID");
    }

    return this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.aiProposal.updateMany({
        where: { id, workspaceId, status: "READY_FOR_REVIEW", expiresAt: { gt: now } },
        data: { status: to, acceptedItemIds: accepted, decidedAt: now, decidedByUserId: workspaceId },
      });
      const row = await tx.aiProposal.findFirstOrThrow({ where: { id, workspaceId }, include: PROPOSAL_INCLUDE });
      if (updated.count === 1) {
        await this.audit.record(tx, {
          type: AUDIT_OF[to],
          actorType: "USER",
          actorUserId: workspaceId,
          targetType: "AI_PROPOSAL",
          targetId: id,
          requestId,
          metadata: to === "PARTIALLY_APPROVED" ? { itemCount: row.itemIds.length, acceptedCount: accepted.length } : { itemCount: row.itemIds.length },
        });
        return toProposalView(row);
      }
      // Nothing changed: the same decision again is the same answer; anything else is a conflict.
      if (row.status === to && sameSet(row.acceptedItemIds, accepted)) return toProposalView(row);
      AiProposalStateMachine.assertTransition(row.status, to);
      throw invalidStateTransition(); // READY_FOR_REVIEW but past its expiry
    });
  }

  /** Proposals past `expires_at` become EXPIRED (research A13); run at the start of each worker cycle. */
  async expireDue(now: Date): Promise<number> {
    return this.prisma.runInTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        UPDATE ai_proposals SET status = 'EXPIRED', decided_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
        WHERE status = 'READY_FOR_REVIEW' AND expires_at <= ${now}::timestamptz
        RETURNING id`;
      for (const { id } of rows) {
        await this.audit.record(tx, { type: "ai_proposal.expired", actorType: "SYSTEM", targetType: "AI_PROPOSAL", targetId: id, metadata: {} });
      }
      return rows.length;
    });
  }
}
