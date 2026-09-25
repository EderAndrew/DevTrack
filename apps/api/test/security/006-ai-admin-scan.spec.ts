import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAKE_PROVIDER_CREDENTIAL, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";

const INPUT_MARKER = "MARCADOR-ENTRADA-006";
const OUTPUT_MARKER = "MARCADOR-SAIDA-006";
const SUBJECT_MARKER = "MARCADOR-DISCIPLINA-006";

/**
 * 006/US7-4 006/SC-007 006/FR-031: with L1 and L2 executions of two teachers carrying content
 * markers, no operations response carries content, the provider credential, user, workspace or
 * resource ids.
 */
describe("006/US7-4 006/SC-007 006/FR-031 as respostas de operação não trazem conteúdo", () => {
  let t: AiTestApp;
  const forbidden: string[] = [INSTRUCTIONS_MARKER, INPUT_MARKER, OUTPUT_MARKER, SUBJECT_MARKER, FAKE_PROVIDER_CREDENTIAL];

  beforeAll(async () => {
    t = await createAiTestApp();
    await resetAiDb(t);
    for (const name of ["A", "B"]) {
      const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
      const cookie = await loginAs(t, teacher);
      const subject = await createSubject(t, teacher.id, { name: `${SUBJECT_MARKER} ${name}` });
      forbidden.push(teacher.id, teacher.email, subject.id);
      const resource = { type: "SUBJECT", id: subject.id };
      t.provider.script(fakeToolCall("reference.read-subject", { subjectId: subject.id }), fakeOutput({ summary: `${OUTPUT_MARKER} ${name}` }));
      const l1 = await requestExecution(t, cookie, { agentKey: "reference-l1", resource, input: { text: `${INPUT_MARKER} ${name}` } });
      await drain(t);
      t.provider.script(fakeOutput({ items: [{ id: "i1", label: `${OUTPUT_MARKER} proposta ${name}` }] }));
      const l2 = await requestExecution(t, cookie, { agentKey: "reference-l2", resource, input: { text: `${INPUT_MARKER} L2 ${name}` } });
      await drain(t);
      forbidden.push(l1.body.id, l2.body.id);
    }
    expect(await t.prisma.aiExecution.count({ where: { status: "COMPLETED" } })).toBe(4);
    expect(await t.prisma.aiProposal.count()).toBe(2);
  });
  afterAll(() => t.close());

  it("nenhuma rota de /ai/operations devolve marcadora, credencial, id de usuário, de área, de recurso ou de execução", async () => {
    const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const responses = [
      await admin.get("/api/ai/operations/health"),
      ...(await Promise.all(["24h", "7d", "30d"].map((period) => admin.get(`/api/ai/operations/metrics?period=${period}`)))),
      await admin.get("/api/ai/operations/agents"),
      await admin.get("/api/ai/operations/model-configs"),
      await admin.post("/api/ai/operations/agents/reference-l1/status", { status: "DISABLED" }),
      await admin.post("/api/ai/operations/agents/reference-l1/status", { status: "ACTIVE" }),
      await admin.post("/api/ai/operations/model-configs/fake-alt/status", { status: "DISABLED" }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      for (const value of forbidden) expect(text, value).not.toContain(value);
    }
    // The metrics did see the executions (the scan is not vacuous).
    const metrics = responses[2]!.body;
    expect(metrics.byAgent.reduce((sum: number, row: { executions: number }) => sum + row.executions, 0)).toBe(4);
    expect(metrics.byModel[0].calls).toBeGreaterThan(0);
  });

  it("o evento de auditoria das mudanças de situação não traz conteúdo", async () => {
    const events = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "ai_" } }, select: { metadata: true } });
    const text = JSON.stringify(events);
    for (const value of [INSTRUCTIONS_MARKER, INPUT_MARKER, OUTPUT_MARKER, SUBJECT_MARKER, FAKE_PROVIDER_CREDENTIAL]) expect(text).not.toContain(value);
  });
});
