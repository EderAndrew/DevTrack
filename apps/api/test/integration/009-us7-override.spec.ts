import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type CatalogModel, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { FAKE_ALT, FAKE_DEFAULT, testApproval } from "../fixtures/ai/model-configs";
import { REFERENCE_ROUTED, REFERENCE_ROUTED_TASK } from "../fixtures/ai/reference-routed";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const TASK = REFERENCE_ROUTED_TASK.key;

/**
 * Catalog entries that must never be fixed for `reference-routed` (BASIC, generation, family
 * `fake`), each approved for it and failing exactly one rule; `priority` 0 keeps them out of the
 * policy's own choice.
 */
const refused = (key: string, patch: Partial<CatalogModel>): CatalogModel =>
  defineCatalogModel({ ...FAKE_DEFAULT, key, model: `fake-model-${key}`, priority: 0, approvals: [testApproval(TASK)], ...patch });

const OTHER_TIER = refused("fake-override-standard", { tier: "STANDARD" });
const OTHER_FAMILY = refused("fake-override-anthropic", { family: "anthropic" });
const OTHER_MODE = refused("fake-override-decision", { mode: "DECISION" });
const NOT_PRODUCTION = refused("fake-override-candidate", { lifecycle: "CANDIDATE" });
const NOT_APPROVED = refused("fake-override-unapproved", { approvals: [] });

describe("009/US7 override só administrativo, dentro do catálogo", () => {
  let t: AiTestApp;
  let admin: TestUser;
  let adminCookie: string;
  let teacherCookie: string;
  let subjectId: string;

  const asAdmin = () => api(t, { cookie: adminCookie });
  const put = (modelConfigKey: string, task = TASK) => asAdmin().put(`/api/ai/operations/tasks/${task}/override`, { modelConfigKey });
  const remove = (task = TASK) => asAdmin().delete(`/api/ai/operations/tasks/${task}/override`);
  const overrideEvents = () => t.prisma.auditEvent.findMany({ where: { type: { in: ["ai_task_override.set", "ai_task_override.removed"] } }, orderBy: { id: "asc" } });

  async function run() {
    t.provider.script(fakeOutput({ summary: "ok" }));
    const res = await requestExecution(t, teacherCookie, { agentKey: REFERENCE_ROUTED.key, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id }, include: { modelConfig: { select: { key: true } } } });
    const requested = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.requested", targetId: execution.id } });
    return { execution, requested: requested.metadata as Record<string, unknown> };
  }

  beforeAll(async () => {
    t = await createAiTestApp({
      agents: [REFERENCE_ROUTED],
      tasks: [REFERENCE_ROUTED_TASK],
      modelConfigs: [OTHER_TIER, OTHER_FAMILY, OTHER_MODE, NOT_PRODUCTION, NOT_APPROVED],
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    admin = await createUser(t, { roles: ["ADMIN"] });
    adminCookie = await loginAs(t, admin);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherCookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  describe("009/US7-1 009/FR-024 fixar um modelo aprovado em PRODUCTION do nível da tarefa", () => {
    it("PUT devolve a tarefa com o override; as novas execuções usam o modelo fixado (motivo OVERRIDE) e a mudança é auditada", async () => {
      expect((await run()).execution.modelConfig?.key).toBe(FAKE_DEFAULT.key);

      const res = await put(FAKE_ALT.key);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        key: TASK,
        selection: { primaryKey: FAKE_ALT.key, reason: "OVERRIDE" },
        override: { modelConfigKey: FAKE_ALT.key },
      });

      const { execution, requested } = await run();
      expect(execution).toMatchObject({ modelConfig: { key: FAKE_ALT.key }, model: FAKE_ALT.model, selectionReason: "OVERRIDE" });
      expect(requested).toMatchObject({ modelConfigKey: FAKE_ALT.key, selectionReason: "OVERRIDE", overrideIgnored: false });
      expect(t.provider.requests.at(-1)?.model).toBe(FAKE_ALT.model);

      const [event] = await overrideEvents();
      const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: TASK } });
      expect(event).toMatchObject({
        type: "ai_task_override.set",
        actorType: "USER",
        actorUserId: admin.id,
        targetType: "AI_TASK",
        targetId: task.id,
        metadata: { taskKey: TASK, modelConfigKey: FAKE_ALT.key, previousModelConfigKey: null },
      });
    });

    it("repetir o mesmo override não muda nada nem gera evento; trocar registra o anterior", async () => {
      await put(FAKE_ALT.key);
      const first = await t.prisma.aiTaskOverride.findFirstOrThrow();
      const again = await put(FAKE_ALT.key);
      expect(again.status).toBe(200);
      expect(again.body.override).toEqual({ modelConfigKey: FAKE_ALT.key, setAt: first.setAt.toISOString() });
      expect(await overrideEvents()).toHaveLength(1);

      expect((await put(FAKE_DEFAULT.key)).body).toMatchObject({ selection: { primaryKey: FAKE_DEFAULT.key, reason: "OVERRIDE" } });
      expect((await overrideEvents()).map((event) => event.metadata)).toEqual([
        { taskKey: TASK, modelConfigKey: FAKE_ALT.key, previousModelConfigKey: null },
        { taskKey: TASK, modelConfigKey: FAKE_DEFAULT.key, previousModelConfigKey: FAKE_ALT.key },
      ]);
      expect(await t.prisma.aiTaskOverride.count()).toBe(1);
    });

    it("DELETE remove o override e audita; sem override, DELETE responde 200 sem evento", async () => {
      await put(FAKE_ALT.key);
      const res = await remove();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ key: TASK, override: null, selection: { primaryKey: FAKE_DEFAULT.key, reason: "LOWEST_COST" } });
      expect(await t.prisma.aiTaskOverride.count()).toBe(0);
      expect((await run()).execution.modelConfig?.key).toBe(FAKE_DEFAULT.key);

      expect((await remove()).status).toBe(200);
      expect((await overrideEvents()).map((event) => [event.type, event.metadata])).toEqual([
        ["ai_task_override.set", { taskKey: TASK, modelConfigKey: FAKE_ALT.key, previousModelConfigKey: null }],
        ["ai_task_override.removed", { taskKey: TASK, modelConfigKey: FAKE_ALT.key }],
      ]);
    });
  });

  describe("009/US7-2 009/FR-024 um modelo fora da política é recusado", () => {
    it.each([
      ["de outro nível", OTHER_TIER.key],
      ["de família não autorizada para a tarefa", OTHER_FAMILY.key],
      ["de outro modo", OTHER_MODE.key],
      ["fora de PRODUCTION", NOT_PRODUCTION.key],
      ["sem aprovação para a tarefa", NOT_APPROVED.key],
      ["fora do catálogo", "fake-override-inexistente"],
    ])("%s → 409 AI_OVERRIDE_NOT_ALLOWED, sem override nem evento", async (_case, key) => {
      const res = await put(key);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "AI_OVERRIDE_NOT_ALLOWED" });
      expect(await t.prisma.aiTaskOverride.count()).toBe(0);
      expect(await overrideEvents()).toEqual([]);
    });

    it("a visão da tarefa lista só os modelos que podem ser fixados agora (overrideCandidates)", async () => {
      const task = () => asAdmin().get("/api/ai/operations/tasks").then((res) => res.body.find((row: { key: string }) => row.key === TASK));
      expect((await task()).overrideCandidates).toEqual([FAKE_ALT.key, FAKE_DEFAULT.key]);
      await asAdmin().post(`/api/ai/operations/model-configs/${FAKE_ALT.key}/status`, { status: "DISABLED" });
      expect((await task()).overrideCandidates).toEqual([FAKE_DEFAULT.key]);
    });

    it("um modelo aprovado mas desabilitado pelo administrador → 409; a aprovação inválida (abaixo dos limiares) também", async () => {
      await asAdmin().post(`/api/ai/operations/model-configs/${FAKE_ALT.key}/status`, { status: "DISABLED" });
      expect((await put(FAKE_ALT.key)).body.code).toBe("AI_OVERRIDE_NOT_ALLOWED");
      await asAdmin().post(`/api/ai/operations/model-configs/${FAKE_ALT.key}/status`, { status: "ENABLED" });

      await t.prisma.aiModelTaskApproval.updateMany({ where: { task: { key: TASK }, modelConfig: { key: FAKE_ALT.key } }, data: { valid: false } });
      expect((await put(FAKE_ALT.key)).body.code).toBe("AI_OVERRIDE_NOT_ALLOWED");
      expect(await t.prisma.aiTaskOverride.count()).toBe(0);
    });

    it("tarefa desconhecida → 404; chave malformada ou corpo com outros campos → 400", async () => {
      expect((await put(FAKE_ALT.key, "tarefa-inexistente")).status).toBe(404);
      expect((await remove("tarefa-inexistente")).status).toBe(404);
      expect((await put(FAKE_ALT.key, "Tarefa Inválida")).status).toBe(400);
      for (const body of [{}, { modelConfigKey: "" }, { modelConfigKey: FAKE_ALT.key, tier: "BASIC" }, { modelConfigKey: FAKE_ALT.key, family: "fake" }, { model: FAKE_ALT.model }]) {
        const res = await asAdmin().put(`/api/ai/operations/tasks/${TASK}/override`, body);
        expect({ status: res.status, code: res.body.code }, JSON.stringify(body)).toEqual({ status: 400, code: "VALIDATION_ERROR" });
      }
      expect(await t.prisma.aiTaskOverride.count()).toBe(0);
    });
  });

  describe("009/US7-3 009/FR-025 o professor não escolhe nem vê modelos", () => {
    it("PUT e DELETE do override e a lista de tarefas e modelos → 403 para o professor", async () => {
      const teacher = api(t, { cookie: teacherCookie });
      expect((await teacher.put(`/api/ai/operations/tasks/${TASK}/override`, { modelConfigKey: FAKE_ALT.key })).status).toBe(403);
      expect((await teacher.delete(`/api/ai/operations/tasks/${TASK}/override`)).status).toBe(403);
      expect((await teacher.get("/api/ai/operations/tasks")).status).toBe(403);
      expect((await teacher.get("/api/ai/operations/models?period=24h")).status).toBe(403);
      expect(await t.prisma.aiTaskOverride.count()).toBe(0);
    });

    it.each(["model", "provider", "family", "tier", "task", "modelConfigKey"])("um pedido de execução com %s no corpo → 400", async (field) => {
      const res = await requestExecution(t, teacherCookie, { agentKey: REFERENCE_ROUTED.key, resource: { type: "SUBJECT", id: subjectId }, [field]: "fake-alt" });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });
  });

  describe("009/US7-4 um override que deixa de valer é ignorado, com o motivo registrado", () => {
    it("modelo fixado desabilitado depois: a política volta à escolha normal e o pedido registra overrideIgnored", async () => {
      await put(FAKE_ALT.key);
      await asAdmin().post(`/api/ai/operations/model-configs/${FAKE_ALT.key}/status`, { status: "DISABLED" });

      const { execution, requested } = await run();
      expect(execution).toMatchObject({ modelConfig: { key: FAKE_DEFAULT.key }, selectionReason: "LOWEST_COST" });
      expect(requested).toMatchObject({ modelConfigKey: FAKE_DEFAULT.key, overrideIgnored: true });
      // The override stays, so it applies again once the model qualifies.
      const task = (await asAdmin().get("/api/ai/operations/tasks")).body.find((row: { key: string }) => row.key === TASK);
      expect(task).toMatchObject({ override: { modelConfigKey: FAKE_ALT.key }, selection: { primaryKey: FAKE_DEFAULT.key } });

      await asAdmin().post(`/api/ai/operations/model-configs/${FAKE_ALT.key}/status`, { status: "ENABLED" });
      expect((await run()).execution).toMatchObject({ modelConfig: { key: FAKE_ALT.key }, selectionReason: "OVERRIDE" });
    });

    it("modelo fixado que perde a aprovação: ignorado da mesma forma", async () => {
      await put(FAKE_ALT.key);
      await t.prisma.aiModelTaskApproval.updateMany({ where: { task: { key: TASK }, modelConfig: { key: FAKE_ALT.key } }, data: { valid: false } });
      const { execution, requested } = await run();
      expect(execution.modelConfig?.key).toBe(FAKE_DEFAULT.key);
      expect(requested).toMatchObject({ overrideIgnored: true });
      expect(execution.selectionReason).not.toBe("OVERRIDE");
    });

    it("sem override, o pedido registra overrideIgnored false", async () => {
      expect((await run()).requested).toMatchObject({ overrideIgnored: false, selectionReason: "LOWEST_COST" });
    });
  });
});
