import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { CURRICULUM_AGENT_KEY } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { CURRICULUM_EXTRACTION_V1 } from "../../src/modules/curriculum-ai/definitions/curriculum-extraction.prompt";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { FAKE_PROVIDER_CREDENTIAL, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, drain, resetAiDb } from "../helpers/ai";
import {
  applyProposal,
  createCurriculumAiApp,
  createCurriculumProposal,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createSubject, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { aiSnapshot } from "./006-ai-authorization-matrix";

const MISSING_ID = "00000000-0000-4000-8000-000000000001";
/** A sentence of the POO sample (`poo.pdf`): the document's content, which a refusal never returns. */
const DOCUMENT_MARKER = "MARCADOR-EMENTA-004";
const SUBJECT_MARKER = "MARCADOR-DISCIPLINA-007";
const OUTPUT_MARKER = "MARCADOR-SAIDA-007";
/** A line of the agent's instructions, which carry nothing of the teacher but never reach the admin either. */
const INSTRUCTIONS_MARKER = CURRICULUM_EXTRACTION_V1.split("\n")[0]!;
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };

interface Area {
  teacher: TestUser;
  cookie: string;
  document: SyllabusDocument;
}

async function area(t: AiTestApp, name: string): Promise<Area> {
  const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
  const subject = await createSubject(t, teacher.id, { name: `${SUBJECT_MARKER} ${name}` });
  const document = await createSyllabusDocument(t, subject.id, { fixture: "poo.pdf", status: "PROCESSED" });
  return { teacher, cookie: await loginAs(t, teacher), document };
}

/** What a refused call must leave untouched: the 006 rows plus the 004 revisions. */
async function snapshot(t: AiTestApp) {
  return {
    ...(await aiSnapshot(t)),
    toolCalls: await t.prisma.aiToolCall.count(),
    revisions: await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, updatedAt: true } }),
  };
}

/**
 * 007/US4 007/SC-002: the teacher's area is closed to the other teacher and to the admin on
 * every AI path — the 007 routes, the 006 routes over the curriculum executions and proposals,
 * and the read tool inside a run.
 */
describe("007/US4 007/SC-002 o agente usa só o documento autorizado e a área de cada professor fica isolada", () => {
  let t: AiTestApp;
  let a: Area;
  let b: Area;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    a = await area(t, "A");
    b = await area(t, "B");
  });

  it("007/US4-1 A e B pedem a análise do próprio documento → ambos aceitos, cada execução na sua área", async () => {
    for (const own of [a, b]) {
      const res = await requestAnalysis(t, own.cookie, own.document.id);
      expect(res.status).toBe(202);
      const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id } });
      expect(row).toMatchObject({ workspaceId: own.teacher.id, resourceType: "SYLLABUS_DOCUMENT", resourceId: own.document.id });
    }
  });

  it("007/US4-2 007/SC-002 análise, status e aplicação sobre o documento do outro, nas duas direções → 404 de inexistente, sem execução", async () => {
    const proposals = new Map([
      [a, await createCurriculumProposal(t, a.teacher.id, a.document)],
      [b, await createCurriculumProposal(t, b.teacher.id, b.document)],
    ]);
    const before = await snapshot(t);

    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const foreign = [
        await requestAnalysis(t, self.cookie, other.document.id),
        await getCurriculumAiStatus(t, self.cookie, other.document.id),
        await applyProposal(t, self.cookie, other.document.id, proposals.get(other)!.id, { acceptedItemIds: ["title"], replaceDraft: false }),
        // The own document with the other's proposal, and the other's document with the own proposal.
        await applyProposal(t, self.cookie, self.document.id, proposals.get(other)!.id, { acceptedItemIds: ["title"], replaceDraft: false }),
        await applyProposal(t, self.cookie, other.document.id, proposals.get(self)!.id, { acceptedItemIds: ["title"], replaceDraft: false }),
      ];
      const missing = await requestAnalysis(t, self.cookie, MISSING_ID);
      for (const res of foreign) {
        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
        expect(res.body).toEqual(missing.body);
        expect(JSON.stringify(res.body)).not.toContain(SUBJECT_MARKER);
      }
    }
    expect(await snapshot(t)).toEqual(before);
    expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "curriculum_ai." } } })).toBe(0);
  });

  it("007/US4-3 B consulta, cancela, decide e aplica a execução e a proposta de A pelas rotas da 006 e da 007 → 404, nada muda", async () => {
    const queued = await createAiExecution(t, a.teacher.id, CURRICULUM_AGENT_KEY, {
      status: "QUEUED",
      resource: { type: "SYLLABUS_DOCUMENT", id: a.document.id },
    });
    const proposal = await createCurriculumProposal(t, a.teacher.id, a.document);
    const client = api(t, { cookie: b.cookie });
    const before = await snapshot(t);

    const calls = [
      await client.get(`/api/ai/executions/${queued.id}`),
      await client.get(`/api/ai/executions/${proposal.executionId}`),
      await client.get(`/api/ai/executions/${proposal.executionId}/result`),
      await client.post(`/api/ai/executions/${queued.id}/cancel`, {}),
      await client.get(`/api/ai/proposals/${proposal.id}`),
      await client.post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "REJECT" }),
      await client.post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "APPROVE" }),
      await getCurriculumAiStatus(t, b.cookie, a.document.id),
      await applyProposal(t, b.cookie, a.document.id, proposal.id, { acceptedItemIds: ["title"], replaceDraft: true }),
    ];
    for (const res of calls) {
      expect({ url: res.request.url, status: res.status }).toEqual({ url: res.request.url, status: 404 });
      expect(res.body).toEqual(NOT_FOUND);
    }
    // The lists of B don't show A's execution nor A's proposal.
    expect((await client.get("/api/ai/executions")).body.items).toEqual([]);
    expect((await client.get("/api/ai/proposals")).body.items).toEqual([]);
    expect(await snapshot(t)).toEqual(before);
  });

  describe("007/US4-4 007/FR-008 a ferramenta nega qualquer documento que não seja o recurso da execução", () => {
    const deniedCases = [
      ["o documento de B", () => b.document.id, "AI_CONTEXT_ACCESS_DENIED", "NOT_FOUND"],
      ["outro documento de A, de outra disciplina", async () => (await seedProcessedDocument(t, a.teacher.id)).document.id, "AI_CONTEXT_ACCESS_DENIED", "NOT_FOUND"],
      ["um id inexistente", () => MISSING_ID, "AI_CONTEXT_ACCESS_DENIED", "NOT_FOUND"],
      ["um id malformado (recusa do esquema)", () => "../documento-de-b", "AI_TOOL_EXECUTION_FAILED", "AI_TOOL_EXECUTION_FAILED"],
    ] as const;

    it.each(deniedCases)(
      "o modelo pede a leitura de %s → negada sem conteúdo, registrada em ai_tool_calls; com onToolDenied continue a execução segue",
      async (_label, forged, code, seen) => {
        const documentId = await forged();
        t.provider.script(
          fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId }),
          fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: a.document.id }),
          fakeOutput(pooOutput()),
        );
        const { body } = await requestAnalysis(t, a.cookie, a.document.id);
        await drain(t);

        const calls = await t.prisma.aiToolCall.findMany({ where: { executionId: body.execution.id }, orderBy: { sequence: "asc" } });
        expect(calls.map((call) => ({ toolKey: call.toolKey, status: call.status, errorCode: call.errorCode }))).toEqual([
          { toolKey: READ_CURRICULUM_DOCUMENT, status: "DENIED", errorCode: code },
          { toolKey: READ_CURRICULUM_DOCUMENT, status: "SUCCEEDED", errorCode: null },
        ]);

        // The model saw only the refusal for the forged id: no block, no subject, no hash.
        const second = t.provider.requests[1]!;
        expect(second.history.at(-1)).toEqual({
          role: "tool",
          toolKey: READ_CURRICULUM_DOCUMENT,
          content: {
            source: `tool:${READ_CURRICULUM_DOCUMENT}`,
            text: `<dados-nao-confiaveis origem="tool:${READ_CURRICULUM_DOCUMENT}">\n${JSON.stringify({ error: seen })}\n</dados-nao-confiaveis>`,
          },
        });
        expect(JSON.stringify(second)).not.toContain(DOCUMENT_MARKER);
        expect(JSON.stringify(second)).not.toContain(`${SUBJECT_MARKER} B`);

        // The run goes on with the authorized document, and the proposal is about it only.
        const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
        expect(execution.status).toBe("COMPLETED");
        expect(execution.proposal).toMatchObject({ targetResourceId: a.document.id, workspaceId: a.teacher.id });
        expect(execution.proposal!.payload).toMatchObject({ source: { documentId: a.document.id } });
        expect(JSON.stringify(t.provider.requests)).not.toContain(`${SUBJECT_MARKER} B`);

        const denial = await t.prisma.auditEvent.findFirstOrThrow({
          where: { type: "ai_tool.failed", targetId: body.execution.id },
          select: { metadata: true },
        });
        expect(denial.metadata).toEqual({ toolKey: READ_CURRICULUM_DOCUMENT, sequence: 1, status: "DENIED", errorCode: code });
      },
    );

    it.each([
      ["perde ementas.revisar (papel TEACHER removido)", async () => {
        await t.prisma.userRole.deleteMany({ where: { userId: a.teacher.id, role: { key: "TEACHER" } } });
      }],
      ["perde a disciplina do documento", async () => {
        await t.prisma.subject.update({ where: { id: a.document.subjectId }, data: { teacherId: b.teacher.id } });
      }],
    ])("professor que %s entre o pedido e a execução → a reautorização da 006 falha e não há proposta", async (_label, lose) => {
      scriptCurriculumRun(t.provider, a.document.id, pooOutput());
      const { body } = await requestAnalysis(t, a.cookie, a.document.id);
      await lose();
      await drain(t);

      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_CONTEXT_ACCESS_DENIED", proposal: null });
      expect(t.provider.requests).toHaveLength(0);
      expect(await t.prisma.aiToolCall.count({ where: { executionId: body.execution.id } })).toBe(0);
    });
  });

  describe("007/US4-5 o administrador não alcança conteúdo", () => {
    it("ADMIN → 403 nas 3 rotas da 007 e nas rotas de conteúdo da 006, sem efeito", async () => {
      const proposal = await createCurriculumProposal(t, a.teacher.id, a.document);
      const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
      const before = await snapshot(t);

      const calls = [
        await admin.get(`/api/syllabus-documents/${a.document.id}/ai`),
        await admin.post(`/api/syllabus-documents/${a.document.id}/ai-analyses`, {}),
        await admin.post(`/api/syllabus-documents/${a.document.id}/ai-proposals/${proposal.id}/apply`, { acceptedItemIds: ["title"], replaceDraft: false }),
        await admin.post("/api/ai/executions", { agentKey: CURRICULUM_AGENT_KEY, resource: { type: "SYLLABUS_DOCUMENT", id: a.document.id }, idempotencyKey: crypto.randomUUID() }),
        await admin.get("/api/ai/executions"),
        await admin.get(`/api/ai/executions/${proposal.executionId}`),
        await admin.get(`/api/ai/executions/${proposal.executionId}/result`),
        await admin.post(`/api/ai/executions/${proposal.executionId}/cancel`, {}),
        await admin.get("/api/ai/proposals"),
        await admin.get(`/api/ai/proposals/${proposal.id}`),
        await admin.post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "REJECT" }),
      ];
      for (const res of calls) {
        expect({ url: res.request.url, status: res.status, code: res.body.code }).toEqual({ url: res.request.url, status: 403, code: "FORBIDDEN" });
      }
      expect(await snapshot(t)).toEqual(before);
    });

    it("006/US7-4 com o agente real: nenhuma resposta de /ai/operations traz documento, disciplina, proposta, instruções, credencial ou ids", async () => {
      const forbidden: string[] = [DOCUMENT_MARKER, SUBJECT_MARKER, OUTPUT_MARKER, INSTRUCTIONS_MARKER, FAKE_PROVIDER_CREDENTIAL];
      for (const own of [a, b]) {
        const output = pooOutput();
        output.title = `${output.title} ${OUTPUT_MARKER}`;
        scriptCurriculumRun(t.provider, own.document.id, output);
        const res = await requestAnalysis(t, own.cookie, own.document.id);
        await drain(t);
        const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: res.body.execution.id } });
        forbidden.push(own.teacher.id, own.teacher.email, own.document.id, own.document.subjectId, res.body.execution.id, proposal.id);
      }
      expect(await t.prisma.aiExecution.count({ where: { agentKey: CURRICULUM_AGENT_KEY, status: "COMPLETED" } })).toBe(2);

      const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
      const responses = [
        await admin.get("/api/ai/operations/health"),
        ...(await Promise.all(["24h", "7d", "30d"].map((period) => admin.get(`/api/ai/operations/metrics?period=${period}`)))),
        await admin.get("/api/ai/operations/agents"),
        await admin.get("/api/ai/operations/model-configs"),
        await admin.post(`/api/ai/operations/agents/${CURRICULUM_AGENT_KEY}/status`, { status: "DISABLED" }),
        await admin.post(`/api/ai/operations/agents/${CURRICULUM_AGENT_KEY}/status`, { status: "ACTIVE" }),
      ];
      for (const res of responses) {
        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        for (const value of forbidden) expect(text, value).not.toContain(value);
      }
      // The metrics did count the curriculum runs (the scan is not vacuous).
      const byAgent = responses[2]!.body.byAgent as { agentKey: string; executions: number }[];
      const curriculum = byAgent.filter((row) => row.agentKey === CURRICULUM_AGENT_KEY);
      expect(curriculum.reduce((sum, row) => sum + row.executions, 0)).toBe(2);
    });
  });

  it.each([
    ["workspaceId", () => ({ workspaceId: b.teacher.id })],
    ["teacherId", () => ({ teacherId: b.teacher.id })],
    ["agentKey", () => ({ agentKey: "reference-l1" })],
    ["toolKeys", () => ({ toolKeys: ["reference.read-subject"] })],
    ["riskLevel", () => ({ riskLevel: "L1_READ_ONLY" })],
  ])("007/US4-6 corpo do pedido com %s → 400, sem execução; a área vem da sessão", async (_field, body) => {
    const res = await api(t, { cookie: a.cookie }).post(`/api/syllabus-documents/${a.document.id}/ai-analyses`, body());
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });
});
