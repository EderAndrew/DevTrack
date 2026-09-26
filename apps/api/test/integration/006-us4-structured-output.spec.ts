import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type FakeStep, fakeEmpty, fakeOutput, fakeText } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createClass, createSubject, createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { LogCapture } from "../helpers/log-capture";

const MARKER = "MARCADOR-SAIDA-006";

/**
 * 006/US4: a model answer becomes a result only when it passes the agent's schema (FR-039,
 * FR-040). Every failure ends in a controlled status, with no result, no proposal and no domain
 * write, and the output never reaches the logs.
 */
describe("006/US4 só resultados válidos pelo esquema do agente são aceitos", () => {
  let t: AiTestApp;
  const logs = new LogCapture();
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp({ logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
    await createClass(t, teacher.id, { subjectId });
    logs.clear();
  });

  /** Domain tables an AI execution must never touch (FR-044). */
  const domainSnapshot = async () => ({
    subjects: await t.prisma.subject.findMany({ orderBy: { id: "asc" } }),
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    documents: await t.prisma.syllabusDocument.count(),
    revisions: await t.prisma.syllabusRevision.count(),
    plans: await t.prisma.classPlan.count(),
    topics: await t.prisma.topic.count(),
  });

  const run = async (agentKey: string, step: FakeStep) => {
    t.provider.script(step);
    const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
  };

  it("006/US4-1 saída válida → COMPLETED, com o resultado", async () => {
    const execution = await run("reference-l1", fakeOutput({ summary: "resumo válido" }));
    expect(execution.status).toBe("COMPLETED");
    const result = await api(t, { cookie }).get(`/api/ai/executions/${execution.id}/result`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ executionId: execution.id, schemaVersion: 1, output: { summary: "resumo válido" } });
  });

  const oversized = () => fakeOutput({ summary: `${MARKER} ${"x".repeat(t.config.ai.limits.maxOutputBytes)}` });

  const failures: [string, string, () => FakeStep, string][] = [
    ["006/US4-2", "texto que não é JSON", () => fakeText(`resposta em texto livre ${MARKER}`), "AI_OUTPUT_PARSE_FAILED"],
    ["006/US4-2", "JSON truncado", () => fakeText(`{"summary": "${MARKER}`), "AI_OUTPUT_PARSE_FAILED"],
    ["006/US4-3", "campo obrigatório ausente", () => fakeOutput({ resumo: MARKER }), "AI_OUTPUT_VALIDATION_FAILED"],
    ["006/US4-3", "tipo errado", () => fakeOutput({ summary: [MARKER] }), "AI_OUTPUT_VALIDATION_FAILED"],
    ["006/US4-3", "campo a mais", () => fakeOutput({ summary: "ok", extra: MARKER }), "AI_OUTPUT_VALIDATION_FAILED"],
    ["006/US4-4", "acima do limite", oversized, "AI_EXECUTION_LIMIT_EXCEEDED"],
    ["006/US4-4", "vazia", () => fakeEmpty(), "AI_OUTPUT_VALIDATION_FAILED"],
  ];

  describe.each(["reference-l1", "reference-l2"])("006/US4-2 006/US4-3 006/US4-4 006/US4-5 006/SC-003 006/FR-039 com %s", (agentKey) => {
    it.each(failures)("%s %s → FAILED com o código certo, sem resultado, proposta nem escrita de domínio", async (_id, _label, step, code) => {
      const before = await domainSnapshot();
      const execution = await run(agentKey, step());

      expect(execution).toMatchObject({ status: "FAILED", errorCode: code, modelCalls: 1 });
      expect(await t.prisma.aiExecutionOutput.count()).toBe(0);
      expect(await t.prisma.aiProposal.count()).toBe(0);
      expect(await domainSnapshot()).toEqual(before);
      // The provider answered successfully: its usage is recorded, the output is not a result.
      expect(await t.prisma.aiModelCall.findFirstOrThrow({ where: { executionId: execution.id } })).toMatchObject({ status: "SUCCEEDED" });
      expect((await api(t, { cookie }).get(`/api/ai/executions/${execution.id}/result`)).status).toBe(409);

      const transitions = await t.prisma.aiExecutionTransition.findMany({ where: { executionId: execution.id }, orderBy: { id: "asc" } });
      expect(transitions.map((row) => row.toStatus)).toEqual(["QUEUED", "RUNNING", "VALIDATING_OUTPUT", "FAILED"]);
      const failed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.failed", targetId: execution.id } });
      expect(JSON.stringify(failed.metadata)).not.toContain(MARKER);

      expect(logs.text()).toContain("ai.output_invalid");
      expect(logs.text()).not.toContain(MARKER);
    });
  });

  it("o log de saída inválida traz só os caminhos, nunca os valores", async () => {
    await run("reference-l1", fakeOutput({ summary: [MARKER] }));
    const line = logs.lines().find((entry) => JSON.stringify(entry).includes("ai.output_invalid"))!;
    expect(JSON.stringify(line)).toContain('"summary"');
    expect(JSON.stringify(line)).not.toContain(MARKER);
  });
});
