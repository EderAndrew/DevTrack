import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AiOperationsService } from "../../src/modules/ai/operations/ai-operations.service";
import { DEFAULT_MODEL_CONFIG_KEY } from "../../src/modules/ai/definitions/model-config-keys";
import { CURRICULUM_AGENT_KEY } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { SYLLABUS_WORKER_PATH } from "../../src/modules/syllabus/syllabus-worker-runner";
import { docxFromBody, paragraph } from "../fixtures/syllabus/build-fixtures.ts";
import { fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, pooOutput, requestAnalysis, scriptCurriculumRun, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createSubject, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { writeFakeWorker } from "../helpers/syllabus-worker";
import { testConfig } from "../helpers/test-app";

/**
 * The Curriculum Agent under failure (007 spec Edge Cases): a lost worker, a reader that hangs, the
 * agent or its model switched off with work queued, and a document too large for the model. Each
 * ends in a known state, with at most one proposal and the syllabus untouched.
 */
describe("007 resiliência do Curriculum Agent", () => {
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

  it("reinício durante a análise (execução presa em RUNNING) → TIMED_OUT no prazo, sem proposta; o novo pedido gera uma só", async () => {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, cookie, document.id);
    // The process died after claiming it: RUNNING with a claim nobody will finish.
    await t.prisma.aiExecution.update({
      where: { id: body.execution.id },
      data: { status: "RUNNING", claimToken: crypto.randomUUID(), startedAt: new Date(), leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id } });

    // After the restart the worker never picks it up again; the deadline ends it.
    await drain(t);
    expect((await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("RUNNING");
    await drain(t, new Date(row.deadlineAt.getTime() + 1000));

    const stuck = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: row.id }, include: { proposal: true } });
    expect(stuck).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT", proposal: null });
    expect(t.provider.requests).toHaveLength(0);

    const again = await requestAnalysis(t, cookie, document.id);
    expect(again.status).toBe(202);
    await drain(t);
    expect(await t.prisma.aiProposal.count()).toBe(1);
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
  });

  it("a mesma execução entregue a dois ciclos do worker → uma chamada de leitura e uma proposta", async () => {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    await requestAnalysis(t, cookie, document.id);
    const worker = t.get(AiExecutionWorker);
    await Promise.all([worker.runOnce(), worker.runOnce()]);

    expect(await t.prisma.aiToolCall.count()).toBe(1);
    expect(await t.prisma.aiProposal.count()).toBe(1);
  });

  it("agente desabilitado pelo administrador com a execução na fila → CANCELLED AI_AGENT_DISABLED, sem chamar o modelo", async () => {
    const { body } = await requestAnalysis(t, cookie, document.id);
    const admin = await createUser(t, { roles: ["ADMIN"] });
    await t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, CURRICULUM_AGENT_KEY, "DISABLED");
    await drain(t);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(row).toMatchObject({ status: "CANCELLED", errorCode: "AI_AGENT_DISABLED", proposal: null });
    expect(t.provider.requests).toHaveLength(0);
  });

  it("agente desabilitado direto no registro, com a execução na fila → a reautorização no início encerra, sem chamar o modelo", async () => {
    const { body } = await requestAnalysis(t, cookie, document.id);
    await t.prisma.aiAgent.update({ where: { key: CURRICULUM_AGENT_KEY }, data: { status: "DISABLED" } });
    await drain(t);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(row).toMatchObject({ status: "CANCELLED", errorCode: "AI_AGENT_DISABLED", proposal: null });
    expect(t.provider.requests).toHaveLength(0);
  });

  it("configuração de modelo desabilitada com a execução na fila → FAILED AI_MODEL_UNAVAILABLE no início", async () => {
    const { body } = await requestAnalysis(t, cookie, document.id);
    await t.prisma.aiModelConfig.update({ where: { key: DEFAULT_MODEL_CONFIG_KEY }, data: { status: "DISABLED" } });
    await drain(t);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(row).toMatchObject({ status: "FAILED", errorCode: "AI_MODEL_UNAVAILABLE", proposal: null });
    expect(t.provider.requests).toHaveLength(0);
  });

  it("documento normalizado acima de 200 KB → AI_EXECUTION_LIMIT_EXCEEDED antes da 2ª chamada ao modelo", async () => {
    const subject = await createSubject(t, teacher.id);
    const body = Array.from({ length: 300 }, (_, n) =>
      paragraph(`Parágrafo ${n + 1}. ${"Conteúdo extenso da ementa para ultrapassar o limite de entrada do modelo. ".repeat(12)}`),
    ).join("");
    const large = await createSyllabusDocument(t, subject.id, {
      fixture: "grande.docx",
      bytes: Buffer.from(docxFromBody(body)),
      status: "PROCESSED",
    });
    scriptCurriculumRun(t.provider, large.id, pooOutput());

    const { body: res } = await requestAnalysis(t, cookie, large.id);
    await drain(t);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.execution.id }, include: { proposal: true } });
    expect(row).toMatchObject({ status: "FAILED", errorCode: "AI_EXECUTION_LIMIT_EXCEEDED", proposal: null });
    expect(t.provider.requests).toHaveLength(1);
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
  });
});

describe("007 resiliência: leitor do documento que não responde", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    const base = testConfig().ai;
    t = await createCurriculumAiApp({
      config: { ai: { ...base, limits: { ...base.limits, toolTimeoutMs: 300 } } },
      overrides: [{ provide: SYLLABUS_WORKER_PATH, useValue: writeFakeWorker("hang") }],
    });
    await resetAiDb(t);
  });
  afterAll(() => t.close());

  it("ferramenta lenta (worker hang) → a leitura termina TIMED_OUT, a execução termina em estado conhecido e sem proposta", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { document } = await seedProcessedDocument(t, teacher.id);
    t.provider.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: document.id }), fakeOutput(pooOutput()));

    const started = Date.now();
    const { body } = await requestAnalysis(t, await loginAs(t, teacher), document.id);
    await drain(t);

    const calls = await t.prisma.aiToolCall.findMany({ where: { executionId: body.execution.id } });
    expect(calls.map((call) => [call.status, call.errorCode])).toEqual([["TIMED_OUT", "AI_TIMEOUT"]]);
    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
    expect(["COMPLETED", "FAILED", "TIMED_OUT"]).toContain(row.status);
    expect(row.proposal).toBeNull();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
  });
});
