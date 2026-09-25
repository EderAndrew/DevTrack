import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiRecordsJob } from "../../src/modules/ai/retention/ai-records.job";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, createAiProposal, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";

const DAY = 86_400_000;

/** 006 research "Retenção": job `ai-records` of `maintenance:run`. */
describe("006 retenção dos registros de IA (job ai-records)", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  const now = new Date("2027-06-01T12:00:00Z");
  const old = new Date(now.getTime() - 400 * DAY);
  const recent = new Date(now.getTime() - 30 * DAY);

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  const run = () => t.get(MaintenanceService).run({ job: "ai-records", now });
  const ids = async () => (await t.prisma.aiExecution.findMany({ select: { id: true } })).map((row) => row.id).sort();

  it("apaga execuções finais antigas em cascata (transições, chamadas, saída, uso)", async () => {
    const subjectId = (await createSubject(t, teacher.id)).id;
    t.provider.script(fakeOutput({ summary: "ok" }));
    const { body } = await requestExecution(t, await loginAs(t, teacher), { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
    await drain(t);
    await t.prisma.aiExecution.update({ where: { id: body.id }, data: { createdAt: old, finishedAt: old } });
    expect(await t.prisma.aiModelCall.count({ where: { executionId: body.id } })).toBeGreaterThan(0);
    expect(await t.prisma.aiExecutionTransition.count({ where: { executionId: body.id } })).toBeGreaterThan(0);

    expect(await run()).toEqual({ status: "completed", results: [{ job: "ai-records", removed: 1 }] });
    expect(await ids()).toEqual([]);
    expect(await t.prisma.aiModelCall.count()).toBe(0);
    expect(await t.prisma.aiExecutionTransition.count()).toBe(0);
    expect(await t.prisma.aiExecutionOutput.count()).toBe(0);
  });

  it("preserva as recentes, as ainda não finais e as com proposta READY_FOR_REVIEW; apaga a proposta já decidida", async () => {
    const kept = [
      await createAiExecution(t, teacher.id, "reference-l1", { status: "COMPLETED", createdAt: recent }),
      await createAiExecution(t, teacher.id, "reference-l1", { status: "QUEUED", createdAt: old }),
    ];
    const gone = [
      await createAiExecution(t, teacher.id, "reference-l1", { status: "FAILED", createdAt: old }),
      await createAiExecution(t, teacher.id, "reference-l1", { status: "TIMED_OUT", createdAt: old }),
    ];
    const pending = await createAiProposal(t, teacher.id, null);
    const decided = await createAiProposal(t, teacher.id, null, { status: "REJECTED" });
    await t.prisma.aiExecution.updateMany({ where: { id: { in: [pending.executionId, decided.executionId] } }, data: { createdAt: old, finishedAt: old } });

    expect(await run()).toMatchObject({ results: [{ job: "ai-records", removed: gone.length + 1 }] });
    expect(await ids()).toEqual([...kept.map((e) => e.id), pending.executionId].sort());
    expect(await t.prisma.aiProposal.findMany({ select: { id: true } })).toEqual([{ id: pending.id }]);
  });

  it("preserva os casos e resultados de avaliação e as versões usadas", async () => {
    const execution = await createAiExecution(t, teacher.id, "reference-l1", { status: "COMPLETED", createdAt: old });
    const store = t.get(AiEvaluationStore);
    const { id: caseId } = await store.recordCase("reference-l1", { key: "caso", version: 1, inputRef: "fixtures/caso.json", expected: { ok: true } });
    await store.recordResult(caseId, { agentVersionId: execution.agentVersionId, promptVersionId: execution.promptVersionId, modelConfigId: execution.modelConfigId, passed: true });

    expect(await run()).toMatchObject({ results: [{ job: "ai-records", removed: 1 }] });
    expect(await t.prisma.aiEvaluationCase.count()).toBe(1);
    expect(await t.prisma.aiEvaluationResult.count()).toBe(1);
    expect(await t.prisma.aiAgentVersion.count({ where: { id: execution.agentVersionId } })).toBe(1);
  });

  it("apaga em lotes e roda de novo sem nada a remover", async () => {
    for (let i = 0; i < 3; i += 1) await createAiExecution(t, teacher.id, "reference-l1", { status: "CANCELLED", createdAt: old });
    expect(t.get(MaintenanceService).registeredJobs()).toContain("ai-records");
    const job = t.get(AiRecordsJob);
    expect(await job.run({ now, batchSize: 2 })).toBe(3);
    expect(await job.run({ now, batchSize: 2 })).toBe(0);
  });
});
