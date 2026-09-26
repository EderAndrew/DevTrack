import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../platform/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { CircuitBreaker, type CircuitTransition } from "./circuit-breaker";

/**
 * Audits each circuit transition in its own transaction (008 contracts/audit-events.md): actor
 * SYSTEM, the model config as target, never content. A failure to audit never fails the call.
 */
@Injectable()
export class CircuitAuditor implements OnModuleInit {
  private readonly logger = new Logger("AiCircuit");

  constructor(
    private readonly breaker: CircuitBreaker,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.breaker.onTransition = (transition) => this.record(transition);
  }

  private async record(transition: CircuitTransition): Promise<void> {
    const { to, configKey, provider, model, failures } = transition;
    this.logger.warn({ configKey, provider, model, failures, circuit: to }, to === "OPEN" ? "ai.circuit_opened" : "ai.circuit_closed");
    try {
      await this.prisma.runInTransaction(async (tx) => {
        const config = await tx.aiModelConfig.findUnique({ where: { key: configKey }, select: { id: true } });
        await this.audit.record(tx, {
          type: to === "OPEN" ? "ai_circuit.opened" : "ai_circuit.closed",
          actorType: "SYSTEM",
          targetType: "AI_MODEL_CONFIG",
          targetId: config?.id ?? null,
          metadata: to === "OPEN" ? { configKey, provider, model, failures } : { configKey, provider, model },
        });
      });
    } catch {
      this.logger.error({ configKey, circuit: to }, "ai.circuit_audit_failed");
    }
  }
}
