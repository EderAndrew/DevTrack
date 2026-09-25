import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import { invalidStateTransition, notFound } from "../../../platform/http/errors";
import { AuditService } from "../../audit/audit.service";
import { AiExecutionStore } from "../execution/ai-execution.store";

export interface OperationsActor {
  userId: string;
  requestId: string | null;
}

export interface AgentStatusChange {
  changed: boolean;
  /** QUEUED executions of the agent that ended CANCELLED with this change. */
  cancelledExecutions: number;
}

/**
 * Operation of the AI foundation by the administrator (006 US7, research A21), without
 * pedagogical content. The per-agent kill switch lives here (FR-051): the transaction that
 * disables an agent also ends its QUEUED executions as CANCELLED (`AI_AGENT_DISABLED`), so none of
 * them reaches the model; one already running is stopped by the runner's own check at start.
 */
@Injectable()
export class AiOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly store: AiExecutionStore,
  ) {}

  /** ACTIVE ⇄ DISABLED; the same status again changes nothing; DRAFT or DEPRECATED agents → 409. */
  async changeAgentStatus(actor: OperationsActor, agentKey: string, to: "ACTIVE" | "DISABLED"): Promise<AgentStatusChange> {
    return this.prisma.runInTransaction(async (tx) => {
      const [agent] = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM ai_agents WHERE key = ${agentKey} FOR UPDATE`;
      if (!agent) throw notFound();
      if (agent.status === to) return { changed: false, cancelledExecutions: 0 };
      if (agent.status !== "ACTIVE" && agent.status !== "DISABLED") throw invalidStateTransition();

      const updated = await tx.aiAgent.update({
        where: { id: agent.id },
        data: { status: to },
        select: { currentVersion: { select: { version: true } } },
      });
      const version = updated.currentVersion?.version ?? null;
      let cancelled = 0;
      if (to === "DISABLED") {
        const queued = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM ai_executions WHERE agent_key = ${agentKey} AND status = 'QUEUED' ORDER BY created_at, id FOR UPDATE`;
        const now = new Date();
        for (const { id } of queued) {
          const finished = await this.store.finish(tx, {
            executionId: id,
            from: ["QUEUED"],
            to: "CANCELLED",
            errorCode: "AI_AGENT_DISABLED",
            now,
            claimToken: null,
            actor: { type: "SYSTEM" },
          });
          if (finished) cancelled += 1;
        }
      }
      const base = { actorType: "USER" as const, actorUserId: actor.userId, requestId: actor.requestId, targetType: "AI_AGENT" as const, targetId: agent.id };
      if (to === "DISABLED") {
        await this.audit.record(tx, { type: "ai_agent.disabled", ...base, metadata: { agentKey, version, cancelledExecutions: cancelled } });
      } else {
        await this.audit.record(tx, { type: "ai_agent.enabled", ...base, metadata: { agentKey, version } });
      }
      return { changed: true, cancelledExecutions: cancelled };
    });
  }
}
