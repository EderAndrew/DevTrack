import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { planningToday } from "../../src/modules/class-plans/planning-date";
import type { AppConfig } from "../../src/platform/config/config.schema";
import { fakeCost, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_ROUTED, REFERENCE_ROUTED_TASK } from "../fixtures/ai/reference-routed";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

type Budgets = AppConfig["ai"]["budgets"];
const NO_BUDGETS: Budgets = { daily: null, monthly: null, perUserMonthly: null, perAgentMonthly: null };

describe("009/US8 orçamentos de IA configuráveis e visíveis, sem bloqueio", () => {
  let t: AiTestApp;
  let teachers: { user: TestUser; cookie: string; subjectId: string }[];
  let adminCookie: string;

  /** The app reads the budgets on every check, so a test sets its own on the running config. */
  const setBudgets = (budgets: Partial<Budgets>) => {
    t.config.ai.budgets = { ...NO_BUDGETS, ...budgets };
  };
  const today = () => planningToday(new Date());
  const budgetEvents = () => t.prisma.auditEvent.findMany({ where: { type: "ai_budget.exceeded" }, orderBy: { id: "asc" } });
  const metrics = async () => (await api(t, { cookie: adminCookie }).get("/api/ai/operations/metrics?period=24h")).body;

  /** Queues one execution of `teacher` whose single call costs `cost` USD (as the provider reports it). */
  async function queue(teacher = 0, cost = "0.40", agentKey = REFERENCE_ROUTED.key) {
    const { cookie, subjectId } = teachers[teacher]!;
    t.provider.script(fakeCost(cost, fakeOutput({ summary: "ok" })));
    const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    return res.body.id as string;
  }
  async function run(teacher = 0, cost = "0.40") {
    const id = await queue(teacher, cost);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id } });
  }

  beforeAll(async () => {
    const base = testConfig();
    t = await createAiTestApp({
      agents: [REFERENCE_ROUTED],
      tasks: [REFERENCE_ROUTED_TASK],
      config: { rateLimit: { ...base.rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100 } },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    setBudgets({});
    teachers = [];
    for (let i = 0; i < 2; i += 1) {
      const user = await createUser(t, { roles: ["TEACHER"] });
      teachers.push({ user, cookie: await loginAs(t, user), subjectId: (await createSubject(t, user.id)).id });
    }
    adminCookie = await loginAs(t, await createUser(t, { roles: ["ADMIN"] }));
  });

  describe("009/US8-1 009/FR-022 consumo do dia, do mês, por agente e por usuário em relação a cada limite", () => {
    it("budgets traz limite, consumo e ultrapassagem; por usuário, só quantos passaram do limite", async () => {
      setBudgets({ daily: "10", monthly: "100", perAgentMonthly: "0.50", perUserMonthly: "0.60" });
      await run(0);
      await run(0);
      await run(1);

      const { budgets } = await metrics();
      const byScope = Object.fromEntries(budgets.map((row: { scope: string; agentKey: string | null }) => [`${row.scope}:${row.agentKey ?? "-"}`, row]));
      expect(byScope["DAILY:-"]).toEqual({ scope: "DAILY", agentKey: null, limit: "10", spent: "1.200000", exceeded: false, usersOverBudget: null });
      expect(byScope["MONTHLY:-"]).toEqual({ scope: "MONTHLY", agentKey: null, limit: "100", spent: "1.200000", exceeded: false, usersOverBudget: null });
      expect(byScope[`PER_AGENT:${REFERENCE_ROUTED.key}`]).toEqual({ scope: "PER_AGENT", agentKey: REFERENCE_ROUTED.key, limit: "0.50", spent: "1.200000", exceeded: true, usersOverBudget: null });
      expect(byScope["PER_USER:-"]).toEqual({ scope: "PER_USER", agentKey: null, limit: "0.60", spent: "1.200000", exceeded: true, usersOverBudget: 1 });
      // Aggregates only: no teacher is identified in the view.
      const text = JSON.stringify(budgets);
      for (const { user } of teachers) expect(text).not.toContain(user.id);
    });

    it("sem orçamento configurado, o consumo aparece com o limite nulo e nada é auditado", async () => {
      await run(0);
      const { budgets } = await metrics();
      expect(budgets).toContainEqual({ scope: "DAILY", agentKey: null, limit: null, spent: "0.400000", exceeded: false, usersOverBudget: null });
      expect(budgets).toContainEqual({ scope: "PER_USER", agentKey: null, limit: null, spent: "0.400000", exceeded: false, usersOverBudget: null });
      expect(await budgetEvents()).toEqual([]);
    });
  });

  describe("009/US8-2 009/FR-022 orçamento atingido: aviso e evento uma vez no período, sem bloquear", () => {
    it("a primeira ultrapassagem de cada orçamento gera ai_budget.exceeded uma vez; os pedidos seguem normalmente", async () => {
      setBudgets({ daily: "1.00", monthly: "1.00", perAgentMonthly: "1.00", perUserMonthly: "1.00" });
      expect((await run(0)).status).toBe("COMPLETED");
      expect((await run(0)).status).toBe("COMPLETED");
      expect(await budgetEvents()).toEqual([]);

      expect((await run(0)).status).toBe("COMPLETED");
      expect((await run(0)).status).toBe("COMPLETED");
      const events = await budgetEvents();
      const month = today().slice(0, 7);
      expect(events.map((event) => event.metadata)).toEqual(
        expect.arrayContaining([
          { scope: "DAILY", period: today(), limit: "1.00", spent: "1.200000", agentKey: null },
          { scope: "MONTHLY", period: month, limit: "1.00", spent: "1.200000", agentKey: null },
          { scope: "PER_AGENT", period: month, limit: "1.00", spent: "1.200000", agentKey: REFERENCE_ROUTED.key },
          { scope: "PER_USER", period: month, limit: "1.00", spent: "1.200000", agentKey: null },
        ]),
      );
      expect(events).toHaveLength(4);
      for (const event of events) expect(event).toMatchObject({ actorType: "SYSTEM", actorUserId: null, targetType: null });
      expect(JSON.stringify(events.map((event) => event.metadata))).not.toContain(teachers[0]!.user.id);

      // A second teacher crossing their own budget is another subject: one more PER_USER event.
      await run(1, "1.10");
      expect((await budgetEvents()).filter((event) => (event.metadata as { scope: string }).scope === "PER_USER")).toHaveLength(2);
      expect(await budgetEvents()).toHaveLength(5);
      expect(await t.prisma.aiBudgetAlert.count()).toBe(5);
    });

    it("execuções simultâneas que cruzam o orçamento geram um único evento por escopo e período", async () => {
      setBudgets({ daily: "1.00" });
      for (let i = 0; i < 6; i += 1) await queue(i % 2);
      const worker = t.get(AiExecutionWorker);
      await Promise.all(Array.from({ length: 6 }, () => worker.runOnce()));
      await drain(t);
      expect(await t.prisma.aiExecution.count({ where: { status: "COMPLETED" } })).toBe(6);
      expect((await budgetEvents()).map((event) => (event.metadata as { scope: string }).scope)).toEqual(["DAILY"]);
    });

    it("a visão marca o orçamento atingido", async () => {
      setBudgets({ daily: "0.50" });
      await run(0);
      await run(0);
      expect((await metrics()).budgets).toContainEqual(expect.objectContaining({ scope: "DAILY", exceeded: true, spent: "0.800000" }));
    });
  });

  describe("009/US8-3 009/FR-023 os limites de cada execução continuam valendo", () => {
    it("com o orçamento estourado, o agente que nunca para de pedir ferramentas para no limite de chamadas", async () => {
      setBudgets({ daily: "0.000001", monthly: "0.000001", perAgentMonthly: "0.000001", perUserMonthly: "0.000001" });
      t.provider.script(fakeToolCall("reference.read-subject", { subjectId: teachers[0]!.subjectId }));
      const res = await requestExecution(t, teachers[0]!.cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: teachers[0]!.subjectId } });
      expect(res.status).toBe(202);
      await drain(t);
      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_EXECUTION_LIMIT_EXCEEDED", modelCalls: t.config.ai.limits.maxModelCalls });
      expect(t.provider.requests).toHaveLength(t.config.ai.limits.maxModelCalls);
    });
  });
});
