import { CurriculumProposalContentSchema, type CurriculumExtractionOutput } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AuditService } from "../../src/modules/audit/audit.service";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { fakeDelay, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  createCurriculumAiApp,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createConfirmedRevision, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const NOTHING_FOUND: CurriculumExtractionOutput = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [] };

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor: timeout");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("007/US1 o professor pede o preenchimento com IA e recebe uma proposta", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let document: SyllabusDocument;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
  });

  it("007/US1-1 007/SC-008 o pedido responde 202 QUEUED na hora, com as versões registradas e a auditoria", async () => {
    t.provider.script(fakeDelay(30_000, fakeOutput(pooOutput())));
    const started = Date.now();
    const res = await requestAnalysis(t, cookie, document.id);
    const elapsed = Date.now() - started;

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      created: true,
      execution: { status: "QUEUED", agent: { key: "curriculum-agent", version: 1 }, resource: { type: "SYLLABUS_DOCUMENT", id: document.id } },
    });
    expect(elapsed).toBeLessThan(1_000);
    expect(t.provider.requests).toHaveLength(0);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id }, include: { modelConfig: true } });
    expect(row).toMatchObject({ workspaceId: teacher.id, agentVersion: 1, promptVersion: 1, model: "claude-opus-5" });
    expect(row.modelConfig.key).toBe("curriculum-extraction-default");
    const schema = await t.prisma.aiOutputSchemaVersion.findUniqueOrThrow({ where: { id: row.outputSchemaVersionId! } });
    expect(schema.version).toBe(1);

    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.analysis_requested" } });
    expect(event).toMatchObject({
      actorType: "USER",
      actorUserId: teacher.id,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: document.id,
      metadata: { executionId: res.body.execution.id, created: true, discardedProposal: false },
    });
  });

  it("007/US1-3 a execução termina COMPLETED com uma proposta CURRICULUM_EXTRACTION pronta, sem mexer na ementa", async () => {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const revisionsBefore = await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" } });
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(execution.status).toBe("COMPLETED");
    const proposal = execution.proposal!;
    expect(proposal).toMatchObject({
      status: "READY_FOR_REVIEW",
      proposalType: "CURRICULUM_EXTRACTION",
      targetResourceType: "SYLLABUS_DOCUMENT",
      targetResourceId: document.id,
    });
    const content = CurriculumProposalContentSchema.parse(proposal.payload);
    expect(content.source).toMatchObject({ documentId: document.id, sha256: Buffer.from(document.sha256).toString("hex") });
    expect(content.extraction.groups).toHaveLength(4);

    expect(await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" } })).toEqual(revisionsBefore);
  });

  it("007/US1-3 007/FR-011 a ferramenta lê o documento da execução uma vez; o contexto do modelo é só {documentId}", async () => {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);

    const toolCalls = await t.prisma.aiToolCall.findMany({ where: { executionId: body.execution.id } });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ toolKey: READ_CURRICULUM_DOCUMENT, status: "SUCCEEDED" });

    expect(t.provider.requests.length).toBeGreaterThan(0);
    for (const request of t.provider.requests) {
      expect(request.context).toEqual({ documentId: document.id });
      expect(JSON.stringify(request)).not.toContain(teacher.name);
      expect(JSON.stringify(request)).not.toContain(teacher.email);
    }
  });

  it("007/FR-047 as duas chamadas ao modelo guardam provedor, modelo, tokens, duração e custo pelo preço da configuração", async () => {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);

    const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: body.execution.id }, orderBy: { sequence: "asc" } });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toMatchObject({ status: "SUCCEEDED", provider: "fake", model: "claude-opus-5", inputTokens: 120, outputTokens: 30, totalTokens: 150, currency: "USD" });
      expect(call.durationMs).toBeGreaterThanOrEqual(0);
      // 120 × 5 / 1M + 30 × 25 / 1M
      expect(call.estimatedCost?.toString()).toBe("0.00135");
    }
  });

  describe("007/US1-4 007/FR-014 uma análise ativa por documento", () => {
    it("clique duplo, nova aba e repetição → uma execução; os demais recebem 200 created: false com a mesma", async () => {
      const both = await Promise.all([requestAnalysis(t, cookie, document.id), requestAnalysis(t, cookie, document.id)]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 202]);
      const ids = new Set(both.map((r) => r.body.execution.id));
      expect(ids.size).toBe(1);
      expect(both.find((r) => r.status === 200)!.body.created).toBe(false);

      const otherTab = await loginAs(t, teacher);
      const again = await requestAnalysis(t, otherTab, document.id);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ created: false, execution: { id: [...ids][0] } });

      expect(await t.prisma.aiExecution.count()).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.requested" } })).toBe(1);
      const requested = await t.prisma.auditEvent.findMany({ where: { type: "curriculum_ai.analysis_requested" } });
      expect(requested.map((e) => (e.metadata as { created: boolean }).created).sort()).toEqual([false, false, true]);
    });

    it("depois que a execução termina, um novo pedido cria outra", async () => {
      scriptCurriculumRun(t.provider, document.id, NOTHING_FOUND);
      const first = await requestAnalysis(t, cookie, document.id);
      await drain(t);
      const second = await requestAnalysis(t, cookie, document.id);
      expect(second.status).toBe(202);
      expect(second.body.execution.id).not.toBe(first.body.execution.id);
    });
  });

  it("007/US1-6 documento com revisão confirmada: o pedido é aceito e a revisão não muda", async () => {
    const confirmed = await createConfirmedRevision(t, document.id, [{ title: "Unidade 1", items: ["Classes"] }]);
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    await drain(t);

    const revision = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: confirmed.revision.id } });
    expect(revision).toEqual(confirmed.revision);
    expect(await t.prisma.syllabusRevision.count()).toBe(1);
  });

  it("007/FR-017 nada identificado → COMPLETED sem proposta e lastOutcome NOTHING_FOUND", async () => {
    scriptCurriculumRun(t.provider, document.id, NOTHING_FOUND);
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(execution.status).toBe("COMPLETED");
    expect(execution.proposal).toBeNull();

    const status = await getCurriculumAiStatus(t, cookie, document.id);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ activeExecution: null, lastExecution: { id: body.execution.id }, lastOutcome: "NOTHING_FOUND", pendingProposalId: null });
  });

  it("007/FR-040 o status mostra a execução ativa e depois a proposta pendente, sem conteúdo", async () => {
    const empty = await getCurriculumAiStatus(t, cookie, document.id);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ activeExecution: null, lastExecution: null, lastOutcome: null, pendingProposalId: null });

    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, cookie, document.id);
    const during = await getCurriculumAiStatus(t, cookie, document.id);
    expect(during.body).toMatchObject({ activeExecution: { id: body.execution.id, status: "QUEUED" }, pendingProposalId: null });

    await drain(t);
    const after = await getCurriculumAiStatus(t, cookie, document.id);
    const proposal = await t.prisma.aiProposal.findFirstOrThrow();
    expect(after.body).toMatchObject({ activeExecution: null, lastExecution: { id: body.execution.id, status: "COMPLETED" }, lastOutcome: "PROPOSAL", pendingProposalId: proposal.id });
    const serialized = JSON.stringify(after.body);
    for (const hidden of ["Encapsulamento", "MARCADOR-EMENTA", "claude-opus-5", "provider"]) expect(serialized, hidden).not.toContain(hidden);
  });

  it("007/FR-040 documento ainda não processado ou sem texto → a razão no status, e o pedido recusado com 409", async () => {
    const pending = await createSyllabusDocument(t, document.subjectId, { fixture: "poo.docx", status: "UPLOADED" });
    const image = (await seedProcessedDocument(t, teacher.id, "ementa.png")).document;

    expect((await getCurriculumAiStatus(t, cookie, pending.id)).body.availability).toBe("DOCUMENT_NOT_READY");
    expect((await getCurriculumAiStatus(t, cookie, image.id)).body.availability).toBe("DOCUMENT_WITHOUT_TEXT");
    for (const id of [pending.id, image.id]) {
      const res = await requestAnalysis(t, cookie, id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("SYLLABUS_NOT_READY_FOR_AI");
    }
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });

  it("agente fora do registro → 409 AI_AGENT_DISABLED, nunca 404 no documento do próprio professor", async () => {
    await t.prisma.aiAgent.update({ where: { key: "curriculum-agent" }, data: { status: "DRAFT" } });
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("AI_AGENT_DISABLED");
    expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("AGENT_DISABLED");
  });

  it("documento de outro professor → 404, sem revelar a existência", async () => {
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherCookie = await loginAs(t, other);
    expect((await getCurriculumAiStatus(t, otherCookie, document.id)).status).toBe(404);
    const res = await requestAnalysis(t, otherCookie, document.id);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });

  describe("007/FR-019 cancelamento", () => {
    it("na fila → CANCELLED na hora, a ementa não muda e o status volta sem execução ativa", async () => {
      scriptCurriculumRun(t.provider, document.id, pooOutput());
      const { body } = await requestAnalysis(t, cookie, document.id);
      const res = await api(t, { cookie }).post(`/api/ai/executions/${body.execution.id}/cancel`, {});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
      await drain(t);

      expect(t.provider.requests).toHaveLength(0);
      expect(await t.prisma.aiProposal.count()).toBe(0);
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
      const status = await getCurriculumAiStatus(t, cookie, document.id);
      expect(status.body).toMatchObject({ activeExecution: null, lastExecution: { status: "CANCELLED" }, lastOutcome: null, pendingProposalId: null });
    });

    it("em andamento → cancelRequested, e a execução termina CANCELLED sem proposta", async () => {
      t.provider.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: document.id }), fakeDelay(2_000, fakeOutput(pooOutput())));
      const { body } = await requestAnalysis(t, cookie, document.id);
      const running = t.get(AiExecutionWorker).runOnce();
      await waitFor(async () => t.provider.requests.length === 2);

      const res = await api(t, { cookie }).post(`/api/ai/executions/${body.execution.id}/cancel`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cancelRequested: true });
      await running;

      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
      expect(execution.status).toBe("CANCELLED");
      expect(execution.proposal).toBeNull();
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
      const status = await getCurriculumAiStatus(t, cookie, document.id);
      expect(status.body).toMatchObject({ activeExecution: null, lastExecution: { status: "CANCELLED" }, pendingProposalId: null });
    });
  });

  describe("007/FR-045 auditoria do pedido", () => {
    it("curriculum_ai.analysis_requested e ai_execution.requested na mesma transação, com o mesmo requestId", async () => {
      const { body } = await requestAnalysis(t, cookie, document.id);
      const domain = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.analysis_requested" } });
      const foundation = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.requested", targetId: body.execution.id } });
      expect(domain.requestId).not.toBeNull();
      expect(domain.requestId).toBe(foundation.requestId);
      expect(foundation.metadata).toMatchObject({ agentKey: "curriculum-agent", resourceType: "SYLLABUS_DOCUMENT" });
      const metadata = JSON.stringify(domain.metadata);
      expect(metadata).not.toContain("Encapsulamento");
    });

    it("se a auditoria do domínio falha, nenhuma execução nem evento fica gravado", async () => {
      const audit = t.get(AuditService);
      const original = audit.record.bind(audit);
      const spy = vi.spyOn(audit, "record").mockImplementation(async (db, entry) => {
        if (entry.type === "curriculum_ai.analysis_requested") throw new Error("falha simulada");
        return original(db, entry);
      });
      try {
        const res = await requestAnalysis(t, cookie, document.id);
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await t.prisma.aiExecution.count()).toBe(0);
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["ai_execution.requested", "curriculum_ai.analysis_requested"] } } })).toBe(0);
    });
  });
});

