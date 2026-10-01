import { routedTask } from "../fixtures/ai/tasks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineAgent } from "../../src/modules/ai/definitions/types";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { FAKE_PROVIDER_CREDENTIAL, fakeError, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER, REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { batchRequest, createExerciseAiApp, requestBatch, scriptGeneration } from "../helpers/exercise-ai";
import { createConfirmedTopic } from "../helpers/exercises";
import { validGeneratedWork } from "../fixtures/work-generation/valid-work";
import { createWorkAiApp, requestWork, scriptWorkGeneration, workGenerationRequest } from "../helpers/work-ai";
import { createConfirmedSyllabus } from "../helpers/works";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";

const INPUT_MARKER = "MARCADOR-ENTRADA-006";
const OUTPUT_MARKER = "MARCADOR-SAIDA-006";
const SUBJECT_MARKER = "MARCADOR-DISCIPLINA-006";

/** 008/FR-020: an agent routed through a fallback, so the 008 fields of the responses have data. */
const FALLBACK_TASK = routedTask({ key: "scan-fallback", maxOutputTokens: 1000, timeoutMs: 30_000 }, ["fake-default", "fake-alt"]);
const FALLBACK_AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "scan-fallback-agent",
  name: "Agente com fallback",
  taskKey: FALLBACK_TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "scan-fallback-agent" },
});

/**
 * 006/US7-4 006/SC-007 006/FR-031: with L1 and L2 executions of two teachers carrying content
 * markers, no operations response carries content, the provider credential, user, workspace or
 * resource ids.
 */
describe("006/US7-4 006/SC-007 006/FR-031 as respostas de operação não trazem conteúdo", () => {
  let t: AiTestApp;
  const forbidden: string[] = [INSTRUCTIONS_MARKER, INPUT_MARKER, OUTPUT_MARKER, SUBJECT_MARKER, FAKE_PROVIDER_CREDENTIAL];

  beforeAll(async () => {
    t = await createAiTestApp({ agents: [FALLBACK_AGENT], tasks: [FALLBACK_TASK] });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
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
      // 008: the primary is down and the fallback answers.
      t.provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
      t.provider.scriptFor("fake-model-2", fakeOutput({ summary: `${OUTPUT_MARKER} fallback ${name}` }));
      const routed = await requestExecution(t, cookie, { agentKey: FALLBACK_AGENT.key, resource, input: { text: `${INPUT_MARKER} fallback ${name}` } });
      await drain(t);
      t.provider.scriptFor("fake-model-1");
      t.provider.scriptFor("fake-model-2");
      forbidden.push(l1.body.id, l2.body.id, routed.body.id);
    }
    expect(await t.prisma.aiExecution.count({ where: { status: "COMPLETED" } })).toBe(6);
    expect(await t.prisma.aiProposal.count()).toBe(2);
  });
  afterAll(() => t.close());

  it("008/FR-020 009/US6-4 009/SC-009 nenhuma rota de /ai/operations devolve marcadora, credencial, id de usuário, de área, de recurso ou de execução", async () => {
    const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const responses = [
      await admin.get("/api/ai/operations/health"),
      ...(await Promise.all(["24h", "7d", "30d"].map((period) => admin.get(`/api/ai/operations/metrics?period=${period}`)))),
      await admin.get("/api/ai/operations/agents"),
      await admin.get("/api/ai/operations/model-configs"),
      // 009: the catalog with approvals and real cost, and the task policies with the current choice.
      ...(await Promise.all(["24h", "7d", "30d"].map((period) => admin.get(`/api/ai/operations/models?period=${period}`)))),
      await admin.get("/api/ai/operations/tasks"),
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
    expect(metrics.byAgent.reduce((sum: number, row: { executions: number }) => sum + row.executions, 0)).toBe(6);
    expect(metrics.byModel[0].calls).toBeGreaterThan(0);
    // The 008 fields were in the scanned responses, with data.
    expect(metrics.byAgent.find((row: { agentKey: string }) => row.agentKey === FALLBACK_AGENT.key)).toMatchObject({ taskKey: FALLBACK_TASK.key, fallbacks: 2 });
    expect(metrics.byModel.some((row: { fallbackCalls: number; failedCalls: number }) => row.fallbackCalls > 0)).toBe(true);
    expect(metrics.byModel.some((row: { failedCalls: number }) => row.failedCalls > 0)).toBe(true);
    // The 009 fields were in the scanned responses, with data.
    expect(metrics.byTask.find((row: { taskKey: string }) => row.taskKey === FALLBACK_TASK.key)).toMatchObject({ executions: 2, fallbacks: 2 });
    expect(metrics.byTier.find((row: { tier: string }) => row.tier === "BASIC").calls).toBeGreaterThan(0);
    expect(metrics.byFamily.find((row: { family: string }) => row.family === "fake").fallbackCalls).toBeGreaterThan(0);
    const models = responses[6]!.body as { key: string; approvals: { avgCostPerExecution: string | null }[] }[];
    expect(models.some((model) => model.approvals.some((approval) => approval.avgCostPerExecution !== null))).toBe(true);
    const tasks = responses[9]!.body as { key: string; selection: object }[];
    expect(tasks.find((task) => task.key === FALLBACK_TASK.key)!.selection).toMatchObject({ primaryKey: "fake-default", fallbackKey: "fake-alt" });
    const agents = responses[4]!.body as { key: string }[];
    expect(agents.find((agent) => agent.key === FALLBACK_AGENT.key)).toMatchObject({ primaryModelConfigKey: "fake-default", fallbackModelConfigKey: "fake-alt" });
  });

  it("o evento de auditoria das mudanças de situação não traz conteúdo", async () => {
    const events = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "ai_" } }, select: { metadata: true } });
    const text = JSON.stringify(events);
    for (const value of [INSTRUCTIONS_MARKER, INPUT_MARKER, OUTPUT_MARKER, SUBJECT_MARKER, FAKE_PROVIDER_CREDENTIAL]) expect(text).not.toContain(value);
  });
});

/**
 * 010/FR-033 (T059): with the exercise generator run by two teachers — one batch generated, one
 * refused — "Operação de IA" shows the agent and its task with numbers only: no topic, statement,
 * answer, solution or explanation, and no user, batch, exercise or execution id.
 */
describe("010/FR-033 a Operação de IA mostra o gerador de exercícios sem conteúdo de exercício", () => {
  let t: AiTestApp;
  const TOPIC_MARKER = "MARCADOR-TOPICO-ADMIN-010";
  const EXERCISE_MARKER = "MARCADOR-EXERCICIO-ADMIN-010";
  const forbidden: string[] = [TOPIC_MARKER, EXERCISE_MARKER, FAKE_PROVIDER_CREDENTIAL];

  beforeAll(async () => {
    t = await createExerciseAiApp();
    await resetAiDb(t);
    for (const name of ["A", "B"]) {
      const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
      const cookie = await loginAs(t, teacher);
      const topic = await createConfirmedTopic(t, teacher.id, { items: [`${TOPIC_MARKER} ${name}`, "Interfaces"] });
      const res = await requestBatch(t, cookie, batchRequest(topic, { difficulty: "BASIC", total: 3, types: ["OPEN_ANSWER"] }));
      expect(res.status).toBe(202);
      const valid = validGeneratedBatch({ difficulty: "BASIC", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null }, `${EXERCISE_MARKER} ${name}`);
      // Teacher A's batch is generated; teacher B's answer has one exercise too few and is refused.
      scriptGeneration(t.provider, res.body.id, name === "A" ? valid : { exercises: valid.exercises.slice(0, 2) });
      await drain(t);
      forbidden.push(teacher.id, teacher.email, res.body.id, topic.itemId, topic.revision.id);
    }
    for (const row of await t.prisma.exercise.findMany({ select: { id: true } })) forbidden.push(row.id);
    for (const row of await t.prisma.aiExecution.findMany({ select: { id: true } })) forbidden.push(row.id);
    expect(await t.prisma.exercise.count()).toBe(3);
    expect(await t.prisma.aiExecution.count({ where: { status: "FAILED" } })).toBe(1);
  });
  afterAll(() => t.close());

  it("nenhuma rota de /ai/operations devolve tópico, exercício, credencial ou id; o agente e a tarefa aparecem com números", async () => {
    const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const responses = {
      health: await admin.get("/api/ai/operations/health"),
      metrics: await admin.get("/api/ai/operations/metrics?period=30d"),
      agents: await admin.get("/api/ai/operations/agents"),
      modelConfigs: await admin.get("/api/ai/operations/model-configs"),
      models: await admin.get("/api/ai/operations/models?period=30d"),
      tasks: await admin.get("/api/ai/operations/tasks"),
    };
    for (const [path, res] of Object.entries(responses)) {
      expect(res.status, path).toBe(200);
      const text = JSON.stringify(res.body);
      for (const value of forbidden) expect(text, `${path}: ${value}`).not.toContain(value);
    }
    // Not vacuous: the generator's two executions and its task are there.
    expect(responses.metrics.body.byAgent.find((row: { agentKey: string }) => row.agentKey === "exercise-generator")).toMatchObject({ taskKey: "exercise-generation", executions: 2 });
    expect(responses.metrics.body.byTask.find((row: { taskKey: string }) => row.taskKey === "exercise-generation")).toMatchObject({ executions: 2 });
    expect((responses.agents.body as { key: string }[]).map((agent) => agent.key)).toContain("exercise-generator");
    expect((responses.tasks.body as { key: string }[]).map((task) => task.key)).toContain("exercise-generation");
  });
});

/**
 * 011/FR-024 (T064): with the work generator run by two teachers — one work generated, one answer
 * refused — "Operação de IA" shows the agent and its task with numbers only: no topic, title,
 * description, statement, answer key, rubric, solution, test case or explanation, and no user,
 * request, work or execution id.
 */
describe("011/FR-024 a Operação de IA mostra o gerador de trabalhos sem conteúdo de trabalho", () => {
  let t: AiTestApp;
  const TOPIC_MARKER = "MARCADOR-TOPICO-ADMIN-011";
  const WORK_MARKER = "MARCADOR-TRABALHO-ADMIN-011";
  const TITLE_MARKER = "MARCADOR-TITULO-ADMIN-011";
  const forbidden: string[] = [TOPIC_MARKER, WORK_MARKER, TITLE_MARKER, FAKE_PROVIDER_CREDENTIAL];

  beforeAll(async () => {
    t = await createWorkAiApp();
    await resetAiDb(t);
    for (const name of ["A", "B"]) {
      const teacher = await createUser(t, { roles: ["TEACHER"], name: `Professor ${name}` });
      const cookie = await loginAs(t, teacher);
      const syllabus = await createConfirmedSyllabus(t, teacher.id, { groups: [{ title: "Orientação a objetos", items: [`${TOPIC_MARKER} ${name}`, "Interfaces"] }] });
      const res = await requestWork(t, cookie, workGenerationRequest(syllabus, { title: `${TITLE_MARKER} ${name}`, description: `${TITLE_MARKER} descrição`, total: 3, types: ["OPEN_ANSWER"] }));
      expect(res.status).toBe(202);
      const valid = validGeneratedWork({ difficulty: "INTERMEDIATE", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null, topicCount: 1 }, `${WORK_MARKER} ${name}`);
      // Teacher A's work is generated; teacher B's answer has one question too few and is refused.
      scriptWorkGeneration(t.provider, res.body.id, name === "A" ? valid : { questions: valid.questions.slice(0, 2) });
      await drain(t);
      forbidden.push(teacher.id, teacher.email, res.body.id, syllabus.itemIds[0]!, syllabus.revision.id, syllabus.subject.id);
    }
    for (const row of await t.prisma.work.findMany({ select: { id: true } })) forbidden.push(row.id);
    for (const row of await t.prisma.aiExecution.findMany({ select: { id: true } })) forbidden.push(row.id);
    expect(await t.prisma.work.count()).toBe(1);
    expect(await t.prisma.aiExecution.count({ where: { status: "FAILED" } })).toBe(1);
  });
  afterAll(() => t.close());

  it("nenhuma rota de /ai/operations devolve tópico, trabalho, credencial ou id; o agente e a tarefa aparecem com números", async () => {
    const admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const responses = {
      health: await admin.get("/api/ai/operations/health"),
      metrics: await admin.get("/api/ai/operations/metrics?period=30d"),
      agents: await admin.get("/api/ai/operations/agents"),
      modelConfigs: await admin.get("/api/ai/operations/model-configs"),
      models: await admin.get("/api/ai/operations/models?period=30d"),
      tasks: await admin.get("/api/ai/operations/tasks"),
    };
    for (const [path, res] of Object.entries(responses)) {
      expect(res.status, path).toBe(200);
      const text = JSON.stringify(res.body);
      for (const value of forbidden) expect(text, `${path}: ${value}`).not.toContain(value);
    }
    // Not vacuous: the generator's two executions and its task are there.
    expect(responses.metrics.body.byAgent.find((row: { agentKey: string }) => row.agentKey === "work-generator")).toMatchObject({ taskKey: "work-generation", executions: 2 });
    expect(responses.metrics.body.byTask.find((row: { taskKey: string }) => row.taskKey === "work-generation")).toMatchObject({ executions: 2 });
    expect((responses.agents.body as { key: string }[]).map((agent) => agent.key)).toContain("work-generator");
    expect((responses.tasks.body as { key: string }[]).map((task) => task.key)).toContain("work-generation");
  });
});
