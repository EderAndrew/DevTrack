import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";

describe("006/US1 worker de execuções", () => {
  let t: AiTestApp;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
    t.provider.script(fakeOutput({ summary: "ok" }));
  });

  const request = () => requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });

  it("assume no máximo 2 execuções por ciclo", async () => {
    for (let i = 0; i < 3; i += 1) await request();
    const worker = t.get(AiExecutionWorker);
    expect(await worker.runOnce()).toBe(2);
    expect(await worker.runOnce()).toBe(1);
    expect(await worker.runOnce()).toBe(0);
    expect(await t.prisma.aiExecution.count({ where: { status: "COMPLETED" } })).toBe(3);
  });

  it("006/US6-5 006/FR-024 dois ciclos simultâneos processam cada execução uma vez, e o resultado é gravado uma vez", async () => {
    for (let i = 0; i < 4; i += 1) await request();
    const worker = t.get(AiExecutionWorker);
    const counts = await Promise.all([worker.runOnce(), worker.runOnce(), worker.runOnce()]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(t.provider.requests).toHaveLength(4);
    expect(await t.prisma.aiModelCall.count()).toBe(4);
    expect(await t.prisma.aiExecutionOutput.count()).toBe(4);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.completed" } })).toBe(4);
  });

  it("006/FR-024 uma gravação com claim antigo não muda nada", async () => {
    const { body } = await request();
    await drain(t);
    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } });
    // A stale writer (an older claim of the same execution) tries to fail it.
    const changed = await t.prisma.aiExecution.updateMany({
      where: { id: body.id, claimToken: "00000000-0000-4000-8000-000000000000" },
      data: { status: "FAILED", errorCode: "AI_PROVIDER_ERROR" },
    });
    expect(changed.count).toBe(0);
    expect((await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } })).status).toBe(row.status);
  });

  it("006/FR-022 kick() não faz nada com o intervalo 0 (kill switch global)", async () => {
    await request();
    t.get(AiExecutionWorker).kick();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await t.prisma.aiExecution.count({ where: { status: "QUEUED" } })).toBe(1);
  });

  it("ai_execution.started e ai_execution.completed são gravados pelo SYSTEM, sem requestId", async () => {
    const { body } = await request();
    await drain(t);
    for (const type of ["ai_execution.started", "ai_execution.completed"]) {
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type } });
      expect(event).toMatchObject({ actorType: "SYSTEM", targetType: "AI_EXECUTION", targetId: body.id });
    }
    const started = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.started" } });
    expect(started.metadata).toEqual({ claim: 1 });
  });
});
