import { describe, expect, it } from "vitest";
import {
  AI_FINAL_EXECUTION_STATUSES,
  AiErrorCodeSchema,
  AiExecutionStatusSchema,
  AiExecutionViewSchema,
  AiMetricsQuerySchema,
  AiProposalViewSchema,
  AiResourceRefSchema,
  ChangeAiAgentStatusRequestSchema,
  DecideAiProposalRequestSchema,
  ErrorCodeSchema,
  RequestAiExecutionRequestSchema,
} from "../src/index.js";

const ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const KEY = "7d1f4a2b-1c3e-4f56-8a9b-0c1d2e3f4a5b";
const NOW = "2026-09-25T12:00:00.000Z";

const request = { agentKey: "reference-l1", resource: { type: "SUBJECT", id: ID }, idempotencyKey: KEY };

describe("006 contratos de IA", () => {
  describe("006/FR-029 pedido de execução", () => {
    it("aceita agente, recurso, entrada e chave de idempotência", () => {
      expect(RequestAiExecutionRequestSchema.safeParse({ ...request, input: { text: "x" } }).success).toBe(true);
      expect(RequestAiExecutionRequestSchema.safeParse({ agentKey: "a", idempotencyKey: KEY }).success).toBe(true);
    });

    it.each(["workspaceId", "teacherId", "ownerId", "userId", "role"])("recusa o campo %s", (field) => {
      expect(RequestAiExecutionRequestSchema.safeParse({ ...request, [field]: ID }).success).toBe(false);
    });

    it("exige chave de idempotência UUID e agente não vazio", () => {
      expect(RequestAiExecutionRequestSchema.safeParse({ ...request, idempotencyKey: "abc" }).success).toBe(false);
      expect(RequestAiExecutionRequestSchema.safeParse({ ...request, agentKey: "" }).success).toBe(false);
      expect(RequestAiExecutionRequestSchema.safeParse({ ...request, agentKey: "a".repeat(64) }).success).toBe(false);
    });

    it("tipo de recurso em maiúsculas e id UUID; campo extra no recurso recusado", () => {
      expect(AiResourceRefSchema.safeParse({ type: "subject", id: ID }).success).toBe(false);
      expect(AiResourceRefSchema.safeParse({ type: "SUBJECT", id: "1" }).success).toBe(false);
      expect(AiResourceRefSchema.safeParse({ type: "SUBJECT", id: ID, ownerId: ID }).success).toBe(false);
    });
  });

  describe("006/FR-045 decisão de proposta", () => {
    it("aprovar e rejeitar sem itens", () => {
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE" }).success).toBe(true);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "REJECT" }).success).toBe(true);
    });

    it("itens só na aprovação parcial, obrigatórios nela, sem repetição", () => {
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE_PARTIALLY", acceptedItemIds: ["a"] }).success).toBe(true);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE_PARTIALLY" }).success).toBe(false);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE_PARTIALLY", acceptedItemIds: [] }).success).toBe(false);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE_PARTIALLY", acceptedItemIds: ["a", "a"] }).success).toBe(false);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "APPROVE", acceptedItemIds: ["a"] }).success).toBe(false);
      expect(DecideAiProposalRequestSchema.safeParse({ decision: "REJECT", acceptedItemIds: ["a"] }).success).toBe(false);
    });
  });

  describe("enums e visões", () => {
    it("006/FR-021 oito situações de execução, quatro finais", () => {
      expect(AiExecutionStatusSchema.options).toHaveLength(8);
      expect([...AI_FINAL_EXECUTION_STATUSES].sort()).toEqual(["CANCELLED", "COMPLETED", "FAILED", "TIMED_OUT"]);
    });

    it("006/FR-050 os 13 códigos normalizados; só os de HTTP entram no catálogo de erros", () => {
      expect(AiErrorCodeSchema.options).toHaveLength(13);
      const http = ErrorCodeSchema.options.filter((code) => code.startsWith("AI_"));
      expect(http.sort()).toEqual(
        [
          "AI_AGENT_DISABLED",
          "AI_AGENT_NOT_FOUND",
          "AI_EXECUTION_LIMIT_EXCEEDED",
          "AI_IDEMPOTENCY_KEY_REUSED",
          "AI_MODEL_UNAVAILABLE",
          "AI_PROPOSAL_ITEMS_INVALID",
          "AI_RESOURCE_TYPE_NOT_ACCEPTED",
        ].sort(),
      );
    });

    it("006/FR-026 a visão da execução não aceita provedor, modelo nem instruções", () => {
      const view = {
        id: ID,
        agent: { key: "reference-l1", name: "Referência", version: 1 },
        status: "COMPLETED",
        riskLevel: "L1_READ_ONLY",
        resource: { type: "SUBJECT", id: ID },
        errorCode: null,
        cancelRequested: false,
        proposalId: null,
        createdAt: NOW,
        startedAt: NOW,
        completedAt: NOW,
        failedAt: null,
        durationMs: 10,
        transitions: [{ from: null, to: "QUEUED", at: NOW }],
      };
      expect(AiExecutionViewSchema.safeParse(view).success).toBe(true);
      expect(AiExecutionViewSchema.safeParse({ ...view, provider: "fake" }).success).toBe(false);
      expect(AiExecutionViewSchema.safeParse({ ...view, model: "m" }).success).toBe(false);
      expect(AiExecutionViewSchema.safeParse({ ...view, prompt: "p" }).success).toBe(false);
    });

    it("a proposta é SUGGESTION e a decisão HUMAN_DECISION (constituição XI)", () => {
      const proposal = {
        id: ID,
        executionId: ID,
        agent: { key: "reference-l2", name: "Referência", version: 1 },
        proposalType: "REFERENCE_ITEMS",
        target: { type: "SUBJECT", id: ID },
        status: "APPROVED",
        nature: "SUGGESTION",
        content: { items: [] },
        itemIds: ["a"],
        acceptedItemIds: null,
        expiresAt: NOW,
        decidedAt: NOW,
        decision: { nature: "HUMAN_DECISION", byUserId: ID },
        createdAt: NOW,
      };
      expect(AiProposalViewSchema.safeParse(proposal).success).toBe(true);
      expect(AiProposalViewSchema.safeParse({ ...proposal, nature: "FACT" }).success).toBe(false);
    });

    it("operação: período padrão de 7 dias; só ACTIVE ⇄ DISABLED pela API", () => {
      expect(AiMetricsQuerySchema.parse({})).toEqual({ period: "7d" });
      expect(AiMetricsQuerySchema.safeParse({ period: "1y" }).success).toBe(false);
      expect(ChangeAiAgentStatusRequestSchema.safeParse({ status: "DEPRECATED" }).success).toBe(false);
      expect(ChangeAiAgentStatusRequestSchema.safeParse({ status: "DISABLED" }).success).toBe(true);
    });
  });
});
