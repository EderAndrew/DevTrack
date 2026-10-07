import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_L1_OWN_LIMIT, REFERENCE_L2_SETTLE, REFERENCE_OWN_LIMIT_PER_HOUR } from "../fixtures/ai/reference-settle";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

/** Global per-agent limit of this suite; `reference-l1-own-limit` declares a higher one of its own. */
const GLOBAL_PER_HOUR = 2;

/**
 * 015 research F9 and F12, the two extensions of the 006 foundation: a proposal its domain settles
 * in the completing transaction, and an agent's own hourly limit.
 */
describe("015/FR-020 extensões da fundação de IA (research F9, F12)", () => {
  let t: AiTestApp;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    const base = testConfig();
    t = await createAiTestApp({
      agents: [REFERENCE_L2_SETTLE, REFERENCE_L1_OWN_LIMIT],
      config: { rateLimit: { ...base.rateLimit, aiExecutionsPerMinute: 1_000, aiAgentPerHour: GLOBAL_PER_HOUR } },
    });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id, { name: "Disciplina decidida" })).id;
  });

  async function run(agentKey: string, items: { id: string; label: string }[]) {
    t.provider.script(fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ items }));
    const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
  }

  const description = async () => (await t.prisma.subject.findUniqueOrThrow({ where: { id: subjectId } })).description;

  describe("proposta decidida pela regra do domínio (research F9)", () => {
    it.each([
      ["approve", "APPROVED", "ai_proposal.approved"],
      ["reject", "REJECTED", "ai_proposal.rejected"],
    ] as const)("%s → %s na mesma transação, sem decisor, auditado como SYSTEM com settledBy DOMAIN_RULE", async (id, status, type) => {
      const execution = await run("reference-l2-settle", [{ id, label: "Item" }]);
      expect(execution).toMatchObject({ status: "COMPLETED", errorCode: null });
      const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: execution.id } });
      expect(proposal).toMatchObject({ status, decidedByUserId: null });
      expect(proposal.decidedAt).not.toBeNull();
      expect(await description()).toBe("decidido: Item");
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type } });
      expect(event).toMatchObject({ actorType: "SYSTEM", actorUserId: null, targetId: proposal.id, metadata: { itemCount: 1, settledBy: "DOMAIN_RULE" } });

      // A settled proposal is no longer the teacher's to decide, and the 006 view shows no human decision.
      const decided = await api(t, { cookie }).post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "REJECT" });
      expect(decided.status).toBe(status === "REJECTED" ? 200 : 409);
      const view = await api(t, { cookie }).get(`/api/ai/proposals/${proposal.id}`);
      expect(view.body).toMatchObject({ status, decision: null });
    });

    it("exceção no materialize → tudo desfeito (proposta, decisão, registro) e FAILED", async () => {
      const warn = vi.spyOn(Logger.prototype, "warn");
      const execution = await run("reference-l2-settle", [{ id: "throw", label: "Item" }]);
      warn.mockRestore();
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED" });
      expect(await t.prisma.aiProposal.count()).toBe(0);
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["ai_proposal.created", "ai_proposal.approved", "ai_proposal.rejected"] } } })).toBe(0);
      expect(await description()).toBeNull();
    });

    it("materialize sem decisão → FAILED e nada gravado", async () => {
      const warn = vi.spyOn(Logger.prototype, "warn");
      const execution = await run("reference-l2-settle", [{ id: "nenhuma", label: "Item" }]);
      const calls = warn.mock.calls.filter((call) => call[1] === "ai.materialize_failed");
      warn.mockRestore();
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED" });
      expect(await t.prisma.aiProposal.count()).toBe(0);
      expect(await description()).toBeNull();
      expect(calls).toHaveLength(1);
    });

    it("agentes sem settle continuam iguais: a proposta espera a revisão", async () => {
      const execution = await run("reference-l2", [{ id: "approve", label: "Item" }]);
      const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: execution.id } });
      expect(proposal).toMatchObject({ status: "READY_FOR_REVIEW", decidedAt: null, decidedByUserId: null });
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["ai_proposal.approved", "ai_proposal.rejected"] } } })).toBe(0);
    });
  });

  describe("limite por agente (research F12)", () => {
    const request = (agentKey: string) => requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });

    it("um agente com limite próprio passa do limite global e para no seu", async () => {
      for (let i = 0; i < REFERENCE_OWN_LIMIT_PER_HOUR; i += 1) {
        expect((await request("reference-l1-own-limit")).status).toBe(202);
      }
      const refused = await request("reference-l1-own-limit");
      expect(refused.status).toBe(429);
      expect(await t.prisma.aiExecution.count({ where: { agentKey: "reference-l1-own-limit" } })).toBe(REFERENCE_OWN_LIMIT_PER_HOUR);
    });

    it("os demais agentes continuam no limite global", async () => {
      for (let i = 0; i < GLOBAL_PER_HOUR; i += 1) {
        expect((await request("reference-l1")).status).toBe(202);
      }
      expect((await request("reference-l1")).status).toBe(429);
      expect(await t.prisma.aiExecution.count({ where: { agentKey: "reference-l1" } })).toBe(GLOBAL_PER_HOUR);
    });
  });
});
