import { Inject, Injectable } from "@nestjs/common";
import type { AiProposalListQuery, AiProposalPage, AiProposalStatus, AiProposalView, DecideAiProposalRequest } from "@repo/contracts";
import { APP_CONFIG } from "../../../platform/config/config.module";
import type { AppConfig } from "../../../platform/config/config.schema";
import { afterCursor, decodeCursor, encodeCursor } from "../../../platform/database/keyset";
import { PrismaService } from "../../../platform/database/prisma.service";
import type { Tx } from "../../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound, rateLimited } from "../../../platform/http/errors";
import type { AuthContext } from "../../../platform/http/request-context";
import { RateLimitService } from "../../../platform/rate-limit/rate-limit.service";
import { AuditService } from "../../audit/audit.service";
import { AI_DEFINITIONS, type AiDefinitions } from "../definitions/types";
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
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
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

  /** For domain modules (007 research C14): the id of the proposal of `proposalType` on `target` still awaiting review, or null. */
  async findPendingForTarget(
    workspaceId: string,
    proposalType: string,
    target: { type: string; id: string },
    now = new Date(),
  ): Promise<string | null> {
    const row = await this.prisma.aiProposal.findFirst({
      where: {
        workspaceId,
        proposalType,
        targetResourceType: target.type,
        targetResourceId: target.id,
        status: "READY_FOR_REVIEW",
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** For domain modules (research A3): an APPROVED or PARTIALLY_APPROVED proposal of the workspace, else 404/409. */
  async getApproved(workspaceId: string, id: string): Promise<AiProposalView> {
    const view = await this.get(workspaceId, id);
    if (view.status !== "APPROVED" && view.status !== "PARTIALLY_APPROVED") throw invalidStateTransition();
    return view;
  }

  async decide(auth: AuthContext, id: string, body: DecideAiProposalRequest, requestId: string | null, now = new Date()): Promise<AiProposalView> {
    const workspaceId = auth.userId;
    await this.assertDecisionRate(auth, requestId);

    const current = await this.prisma.aiProposal.findFirst({ where: { id, workspaceId }, select: { agentKey: true } });
    if (!current) throw notFound();
    // An agent that approves through its domain (007 research C12.6) is approved only by that flow.
    const agent = this.definitions.agents.find((definition) => definition.key === current.agentKey);
    if (body.decision !== "REJECT" && agent?.proposal?.approveThroughDomain) throw new AppException("AI_PROPOSAL_APPLY_REQUIRED");

    return this.prisma.runInTransaction((tx) => this.decideWithin(tx, auth, id, body, requestId, now));
  }

  /** The decision limit per teacher (006 `ai-decision`), shared with the domain apply flows (007 contracts/http-api.md). */
  async assertDecisionRate(auth: AuthContext, requestId: string | null): Promise<void> {
    const limit = await this.rateLimit.hit("ai-decision", auth.userId, { limit: this.config.rateLimit.aiDecisionsPerMinute, windowSec: 60 });
    if (!limit.blocked) return;
    await this.audit.record(this.prisma, {
      type: "ai_execution.rate_limited",
      actorType: "USER",
      actorUserId: auth.userId,
      requestId,
      metadata: { scope: "ai-decision" },
    });
    throw rateLimited(limit.retryAfterSec);
  }

  /**
   * The transactional core of `decide` (007 research C12.2), for a domain that applies the
   * proposal in the same transaction: no rate limit and no `approveThroughDomain` refusal.
   */
  async decideWithin(
    tx: Tx,
    auth: AuthContext,
    id: string,
    body: DecideAiProposalRequest,
    requestId: string | null,
    now = new Date(),
  ): Promise<AiProposalView> {
    const workspaceId = auth.userId;
    const current = await tx.aiProposal.findFirst({ where: { id, workspaceId }, select: { itemIds: true } });
    if (!current) throw notFound();
    const to = STATUS_OF[body.decision];
    const accepted = body.acceptedItemIds ?? [];
    if (to === "PARTIALLY_APPROVED" && (!accepted.every((item) => current.itemIds.includes(item)) || sameSet(accepted, current.itemIds))) {
      throw new AppException("AI_PROPOSAL_ITEMS_INVALID");
    }

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
  }

  /** For domain modules (007 research C12.2): the proposal of the workspace, locked until the transaction ends; 404 otherwise. */
  async getForUpdate(tx: Tx, workspaceId: string, id: string): Promise<AiProposalView> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM ai_proposals WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw notFound();
    return toProposalView(await tx.aiProposal.findUniqueOrThrow({ where: { id }, include: PROPOSAL_INCLUDE }));
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
