import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_L2_BUILD } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiProposal, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createClass, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const MISSING_ID = "00000000-0000-4000-8000-000000000001";
const DAY = 86_400_000;
const CONTENT_MARKER = "MARCADOR-PROPOSTA-006";

/**
 * 006/US5: an L2 agent's result is a proposal the teacher reviews (research A13). Only the owner
 * decides, one decision wins, a proposal expires, and nothing of it ever reaches the domain.
 */
describe("006/US5 o professor revisa propostas de agentes", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
    await createClass(t, teacher.id, { subjectId });
  });

  const client = () => api(t, { cookie });
  const decide = (id: string, body: object, as = cookie) => api(t, { cookie: as }).post(`/api/ai/proposals/${id}/decision`, body);

  const domainSnapshot = async () => ({
    subjects: await t.prisma.subject.findMany({ orderBy: { id: "asc" } }),
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    documents: await t.prisma.syllabusDocument.count(),
    revisions: await t.prisma.syllabusRevision.count(),
    plans: await t.prisma.classPlan.count(),
    topics: await t.prisma.topic.count(),
  });

  /** Runs `reference-l2` to completion and returns its proposal id. */
  async function proposeThroughAgent(): Promise<{ executionId: string; proposalId: string }> {
    t.provider.script(
      fakeOutput({ items: [{ id: "i1", label: `Item 1 ${CONTENT_MARKER}` }, { id: "i2", label: "Item 2" }, { id: "i3", label: "Item 3" }] }),
    );
    const res = await requestExecution(t, cookie, { agentKey: "reference-l2", resource: { type: "SUBJECT", id: subjectId } });
    await drain(t);
    const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: res.body.id } });
    return { executionId: res.body.id, proposalId: proposal.id };
  }

  it("006/US5-1 reference-l2 concluída → uma proposta READY_FOR_REVIEW ligada à execução, ao agente, ao tipo e ao alvo", async () => {
    const { executionId, proposalId } = await proposeThroughAgent();

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: executionId } });
    expect(execution).toMatchObject({ status: "COMPLETED", step: "PROPOSAL_CREATED" });
    expect(await t.prisma.aiExecutionOutput.count()).toBe(0);
    const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(proposal).toMatchObject({
      workspaceId: teacher.id,
      agentKey: "reference-l2",
      agentVersionId: execution.agentVersionId,
      proposalType: "REFERENCE_ITEMS",
      targetResourceType: "SUBJECT",
      targetResourceId: subjectId,
      itemIds: ["i1", "i2", "i3"],
      status: "READY_FOR_REVIEW",
    });
    expect(proposal.expiresAt.getTime() - proposal.createdAt.getTime()).toBe(t.config.ai.proposalTtlDays * DAY);

    const view = await client().get(`/api/ai/executions/${executionId}`);
    expect(view.body.proposalId).toBe(proposalId);

    const created = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_proposal.created" } });
    expect(created).toMatchObject({ actorType: "SYSTEM", targetType: "AI_PROPOSAL", targetId: proposalId });
    expect(created.metadata).toEqual({ executionId, agentKey: "reference-l2", proposalType: "REFERENCE_ITEMS", itemCount: 3 });
    const completed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.completed" } });
    expect(completed.metadata).toMatchObject({ proposalId });
    expect(JSON.stringify(await t.prisma.auditEvent.findMany({ select: { metadata: true } }))).not.toContain(CONTENT_MARKER);
  });

  it("006/US5-2 o dono abre a proposta e vê o conteúdo como sugestão; a lista não traz o conteúdo", async () => {
    const { executionId, proposalId } = await proposeThroughAgent();

    const view = await client().get(`/api/ai/proposals/${proposalId}`);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({
      id: proposalId,
      executionId,
      agent: { key: "reference-l2", name: "Agente de referência (proposta)", version: 1 },
      proposalType: "REFERENCE_ITEMS",
      target: { type: "SUBJECT", id: subjectId },
      status: "READY_FOR_REVIEW",
      nature: "SUGGESTION",
      itemIds: ["i1", "i2", "i3"],
      acceptedItemIds: null,
      decidedAt: null,
      decision: null,
    });
    expect(view.body.content.items[0].label).toContain(CONTENT_MARKER);

    const list = await client().get("/api/ai/proposals");
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([proposalId]);
    expect(list.body.items[0]).not.toHaveProperty("content");
    expect(JSON.stringify(list.body)).not.toContain(CONTENT_MARKER);
    expect((await client().get("/api/ai/proposals?status=REJECTED")).body.items).toEqual([]);
  });

  describe("006/US5-3 decisões do dono", () => {
    it.each([
      ["APPROVE", {}, "APPROVED", "ai_proposal.approved", { itemCount: 3 }],
      ["APPROVE_PARTIALLY", { acceptedItemIds: ["i1", "i3"] }, "PARTIALLY_APPROVED", "ai_proposal.partially_approved", { itemCount: 3, acceptedCount: 2 }],
      ["REJECT", {}, "REJECTED", "ai_proposal.rejected", { itemCount: 3 }],
    ])("%s → %s, com decidedAt, decidedByUserId e auditoria", async (decision, extra, status, type, metadata) => {
      const { proposalId } = await proposeThroughAgent();
      const res = await decide(proposalId, { decision, ...extra });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status, decision: { nature: "HUMAN_DECISION", byUserId: teacher.id }, decidedAt: expect.any(String) });
      if (status === "PARTIALLY_APPROVED") expect(res.body.acceptedItemIds).toEqual(["i1", "i3"]);

      const row = await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposalId } });
      expect(row).toMatchObject({ status, decidedByUserId: teacher.id });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type } });
      expect(event).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "AI_PROPOSAL", targetId: proposalId });
      expect(event.metadata).toEqual(metadata);
    });
  });

  describe("006/US5-4 decisão idempotente e itens validados", () => {
    it("mesma decisão de novo → 200 igual e nada novo; decisão diferente → 409", async () => {
      const proposal = await createAiProposal(t, teacher.id, subjectId);
      const first = await decide(proposal.id, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i2"] });
      const again = await decide(proposal.id, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i2"] });
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.partially_approved" } })).toBe(1);

      for (const body of [{ decision: "REJECT" }, { decision: "APPROVE" }, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i1"] }]) {
        const res = await decide(proposal.id, body);
        expect({ body, status: res.status, code: res.body.code }).toEqual({ body, status: 409, code: "INVALID_STATE_TRANSITION" });
      }
    });

    it.each([
      ["desconhecido", ["i1", "x9"]],
      ["igual a todos", ["i3", "i1", "i2"]],
    ])("acceptedItemIds %s → 422 AI_PROPOSAL_ITEMS_INVALID, sem decisão", async (_label, acceptedItemIds) => {
      const proposal = await createAiProposal(t, teacher.id, subjectId);
      const res = await decide(proposal.id, { decision: "APPROVE_PARTIALLY", acceptedItemIds });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: "AI_PROPOSAL_ITEMS_INVALID" });
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("READY_FOR_REVIEW");
    });

    it("acceptedItemIds vazio → recusado pelo contrato (400), sem decisão", async () => {
      const proposal = await createAiProposal(t, teacher.id, subjectId);
      for (const body of [{ decision: "APPROVE_PARTIALLY", acceptedItemIds: [] }, { decision: "APPROVE_PARTIALLY" }, { decision: "APPROVE", acceptedItemIds: ["i1"] }]) {
        expect((await decide(proposal.id, body)).status).toBe(400);
      }
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("READY_FOR_REVIEW");
    });
  });

  it("006/US5-5 006/US5-6 nenhuma decisão altera tabela de domínio", async () => {
    const before = await domainSnapshot();
    const { proposalId } = await proposeThroughAgent();
    await decide(proposalId, { decision: "APPROVE" });
    for (const [decision, extra] of [["APPROVE_PARTIALLY", { acceptedItemIds: ["i1"] }], ["REJECT", {}]] as const) {
      const other = await createAiProposal(t, teacher.id, subjectId);
      expect((await decide(other.id, { decision, ...extra })).status).toBe(200);
    }
    expect(await domainSnapshot()).toEqual(before);
  });

  describe("006/US5-7 expiração", () => {
    it("com o relógio 30 dias à frente, o ciclo marca EXPIRED + ai_proposal.expired, e decidir → 409", async () => {
      const { proposalId } = await proposeThroughAgent();
      await drain(t, new Date(Date.now() + (t.config.ai.proposalTtlDays + 1) * DAY));

      const row = await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposalId } });
      expect(row).toMatchObject({ status: "EXPIRED", decidedByUserId: null });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_proposal.expired" } });
      expect(event).toMatchObject({ actorType: "SYSTEM", targetType: "AI_PROPOSAL", targetId: proposalId });
      const res = await decide(proposalId, { decision: "APPROVE" });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });
    });

    it("vencida mas antes do ciclo → decidir dá 409, e a proposta segue sem decisão", async () => {
      const proposal = await createAiProposal(t, teacher.id, subjectId, { expiresAt: new Date(Date.now() - 1_000) });
      expect((await decide(proposal.id, { decision: "REJECT" })).status).toBe(409);
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("READY_FOR_REVIEW");
    });

    it("a expiração não toca propostas no prazo nem já decididas", async () => {
      const open = await createAiProposal(t, teacher.id, subjectId);
      const decided = await createAiProposal(t, teacher.id, subjectId, { status: "REJECTED", expiresAt: new Date(Date.now() - DAY) });
      await drain(t);
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("READY_FOR_REVIEW");
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: decided.id } })).status).toBe("REJECTED");
    });
  });

  it("proposta de um agente depois desabilitado continua decidível", async () => {
    const { proposalId } = await proposeThroughAgent();
    await t.prisma.aiAgent.update({ where: { key: "reference-l2" }, data: { status: "DISABLED" } });
    expect((await decide(proposalId, { decision: "APPROVE" })).status).toBe(200);
  });

  it("outro professor → 404 igual ao de inexistente; ADMIN → 403", async () => {
    const proposal = await createAiProposal(t, teacher.id, subjectId);
    const other = await loginAs(t, await createUser(t, { roles: ["TEACHER"] }));
    const foreign = await decide(proposal.id, { decision: "APPROVE" }, other);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual((await decide(MISSING_ID, { decision: "APPROVE" }, other)).body);
    expect((await api(t, { cookie: other }).get(`/api/ai/proposals/${proposal.id}`)).status).toBe(404);
    expect((await api(t, { cookie: other }).get("/api/ai/proposals")).body.items).toEqual([]);

    const admin = await loginAs(t, await createUser(t, { roles: ["ADMIN"] }));
    expect((await decide(proposal.id, { decision: "APPROVE" }, admin)).status).toBe(403);
    expect((await api(t, { cookie: admin }).get(`/api/ai/proposals/${proposal.id}`)).status).toBe(403);
    expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("READY_FOR_REVIEW");
  });

  it("006/FR-047 o conteúdo da proposta não pode ser alterado (trigger)", async () => {
    const proposal = await createAiProposal(t, teacher.id, subjectId);
    await expect(t.prisma.aiProposal.update({ where: { id: proposal.id }, data: { payload: { items: [] } } })).rejects.toThrow();
    await expect(t.prisma.aiProposal.update({ where: { id: proposal.id }, data: { itemIds: ["z"] } })).rejects.toThrow();
    expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).payload).toEqual(proposal.payload);
  });

  it("decisões acima do limite por minuto → 429", async () => {
    const limit = t.config.rateLimit.aiDecisionsPerMinute;
    for (let i = 0; i < limit; i += 1) expect((await decide(MISSING_ID, { decision: "APPROVE" })).status).toBe(404);
    const blocked = await decide(MISSING_ID, { decision: "APPROVE" });
    expect({ status: blocked.status, code: blocked.body.code }).toEqual({ status: 429, code: "RATE_LIMITED" });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.rate_limited" } });
    expect(event.metadata).toEqual({ scope: "ai-decision" });
  });
});

/**
 * 007 research C6: the optional `proposal.build` hook of an L2 agent turns the validated output and
 * the successful tool results into the proposal; `null` means nothing to propose, and a throw is an
 * output that could not become a proposal. The 006 error codes do not change.
 */
describe("007/FR-017 006/US5 gancho proposal.build", () => {
  let t: AiTestApp;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp({ agents: [REFERENCE_L2_BUILD] });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id, { name: "Disciplina do build" })).id;
  });

  async function run(agentKey: string, items: { id: string; label: string }[]) {
    t.provider.script(fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ items }));
    const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
  }

  it("o conteúdo e os itemIds vêm do gancho, que recebe os resultados das ferramentas em ordem", async () => {
    const execution = await run("reference-l2-build", [
      { id: "i1", label: "Primeiro" },
      { id: "i2", label: "Segundo" },
    ]);
    expect(execution).toMatchObject({ status: "COMPLETED", errorCode: null });
    const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: execution.id } });
    const view = await api(t, { cookie }).get(`/api/ai/executions/${execution.id}`);
    expect(view.body.proposalId).toBe(proposal.id);
    expect(proposal).toMatchObject({ proposalType: "REFERENCE_BUILT", status: "READY_FOR_REVIEW", itemIds: ["b:i1", "b:i2"] });
    expect(proposal.payload).toEqual({
      built: true,
      labels: ["Primeiro", "Segundo"],
      tools: [{ toolKey: "reference.read-subject", output: { id: subjectId, name: "Disciplina do build" } }],
    });
    const created = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_proposal.created" } });
    expect(created.metadata).toMatchObject({ proposalType: "REFERENCE_BUILT", itemCount: 2 });
  });

  it("null → COMPLETED sem proposta e sem resultado guardado", async () => {
    const execution = await run("reference-l2-build", [{ id: "nothing", label: "Nada" }]);
    expect(execution).toMatchObject({ status: "COMPLETED", errorCode: null });
    expect(await t.prisma.aiProposal.count()).toBe(0);
    expect(await t.prisma.aiExecutionOutput.count()).toBe(0);
    const view = await api(t, { cookie }).get(`/api/ai/executions/${execution.id}`);
    expect(view.body).toMatchObject({ status: "COMPLETED", proposalId: null });
    const completed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.completed" } });
    expect(completed.metadata).toMatchObject({ proposalId: null });
  });

  it("exceção no gancho → FAILED AI_OUTPUT_VALIDATION_FAILED, sem proposta, e log sem conteúdo", async () => {
    // Several apps in one file share Nest's static logger, so the call is checked, not the stream.
    const warn = vi.spyOn(Logger.prototype, "warn");
    const execution = await run("reference-l2-build", [{ id: "throw", label: "MARCADOR-BUILD-007" }]);
    const calls = warn.mock.calls.filter((call) => call[1] === "ai.output_invalid");
    warn.mockRestore();
    expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED" });
    expect(await t.prisma.aiProposal.count()).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toMatchObject({ executionId: execution.id, errorCode: "AI_OUTPUT_VALIDATION_FAILED", errorName: "Error" });
    expect(JSON.stringify(calls)).not.toContain("MARCADOR-BUILD-007");
    expect(JSON.stringify(calls)).not.toContain("falha simulada no build");
  });

  it("os agentes de referência sem gancho continuam iguais: o conteúdo é a saída", async () => {
    const items = [{ id: "i1", label: "Item" }];
    const execution = await run("reference-l2", items);
    const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: execution.id } });
    expect(proposal).toMatchObject({ proposalType: "REFERENCE_ITEMS", itemIds: ["i1"], payload: { items } });
  });
});
