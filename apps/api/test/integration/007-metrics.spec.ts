import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRICULUM_AGENT_KEY } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { fakeText, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, drain, resetAiDb } from "../helpers/ai";
import {
  createCurriculumAiApp,
  createCurriculumProposal,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";

/**
 * 007/FR-048 (research C12.5): the admin's per-agent metrics of the Curriculum Agent — success,
 * output validation failures, proposals by status, average duration, tokens and cost per analysis —
 * with no pedagogical content.
 */
describe("007/FR-048 indicadores do Curriculum Agent na operação de IA", () => {
  let t: AiTestApp;
  let metrics: Record<string, unknown>;
  let rejectedRunId: string;
  let invalidRunId: string;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const resource = (id: string) => ({ type: "SYLLABUS_DOCUMENT", id });

    // Two real runs (with model calls, tokens and cost): one proposal the teacher rejects, one invalid output.
    const { document: first } = await seedProcessedDocument(t, teacher.id);
    scriptCurriculumRun(t.provider, first.id, pooOutput());
    rejectedRunId = (await requestAnalysis(t, cookie, first.id)).body.execution.id;
    await drain(t);
    const proposal = await t.prisma.aiProposal.findUniqueOrThrow({ where: { executionId: rejectedRunId } });
    expect((await api(t, { cookie }).post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "REJECT" })).status).toBe(200);

    const { document: second } = await seedProcessedDocument(t, teacher.id);
    t.provider.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: second.id }), fakeText("não é JSON"));
    invalidRunId = (await requestAnalysis(t, cookie, second.id)).body.execution.id;
    await drain(t);

    // The other outcomes, written straight to the database (no model calls).
    const { document } = await seedProcessedDocument(t, teacher.id);
    for (const status of ["APPROVED", "PARTIALLY_APPROVED", "EXPIRED"] as const) await createCurriculumProposal(t, teacher.id, document, { status });
    await createCurriculumProposal(t, teacher.id, document, { expiresAt: new Date(Date.now() - 1000) });
    await createCurriculumProposal(t, teacher.id, document);
    await createAiExecution(t, teacher.id, CURRICULUM_AGENT_KEY, { status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", resource: resource(document.id) });
    await createAiExecution(t, teacher.id, CURRICULUM_AGENT_KEY, { status: "FAILED", errorCode: "AI_PROVIDER_ERROR", resource: resource(document.id) });
    await createAiExecution(t, teacher.id, CURRICULUM_AGENT_KEY, { status: "TIMED_OUT", resource: resource(document.id) });
    await createAiExecution(t, teacher.id, CURRICULUM_AGENT_KEY, { status: "CANCELLED", resource: resource(document.id) });

    const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const res = await admin.get("/api/ai/operations/metrics?period=24h");
    expect(res.status).toBe(200);
    const rows = (res.body.byAgent as Record<string, unknown>[]).filter((row) => row.agentKey === CURRICULUM_AGENT_KEY);
    expect(rows).toHaveLength(1);
    metrics = rows[0]!;
  });
  afterAll(() => t.close());

  it("contagens de execução: sucesso, falhas, falhas de validação da saída, tempo esgotado e canceladas", () => {
    expect(metrics).toMatchObject({
      executions: 11,
      completed: 6,
      failed: 3,
      outputInvalid: 2,
      timedOut: 1,
      cancelled: 1,
    });
  });

  it("propostas por situação: aprovadas, aprovadas em parte, rejeitadas e expiradas (inclusive a pendente vencida)", () => {
    expect(metrics.proposals).toEqual({ created: 6, approved: 1, partiallyApproved: 1, rejected: 1, expired: 2 });
  });

  it("tokens e custo médios por análise, só das execuções com chamadas ao modelo, na moeda da configuração", async () => {
    const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: { in: [rejectedRunId, invalidRunId] } } });
    const perExecution = [rejectedRunId, invalidRunId].map((id) => calls.filter((call) => call.executionId === id));
    const tokens = perExecution.map((rows) => rows.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0));
    const cost = perExecution.map((rows) => rows.reduce((sum, call) => sum + Number(call.estimatedCost), 0));

    expect(metrics.avgTotalTokens).toBe(Math.round((tokens[0]! + tokens[1]!) / 2));
    expect(Number(metrics.avgEstimatedCost)).toBeCloseTo((cost[0]! + cost[1]!) / 2, 6);
    expect(metrics.avgEstimatedCost).toMatch(/^\d+\.\d{6}$/);
    expect(metrics.currency).toBe("USD");
    expect(typeof metrics.avgDurationMs).toBe("number");
  });

  it("só números, versões e nomes técnicos: nenhum id, conteúdo ou texto do documento", () => {
    const text = JSON.stringify(metrics);
    expect(text).not.toContain(rejectedRunId);
    expect(text).not.toContain("MARCADOR-EMENTA-004");
    expect(text).not.toContain("Object-Oriented Programming");
  });
});
