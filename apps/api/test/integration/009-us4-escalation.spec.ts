import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, fakeOutput, fakeText } from "../fixtures/ai/fake-model-provider";
import {
  ESCALATING_AGENT,
  ESCALATING_L2_AGENT,
  ESCALATING_TASK,
  ESCALATION_DEFINITIONS,
  FAKE_ADVANCED,
  FAKE_STANDARD,
  NO_ESCALATION_AGENT,
  ONE_CALL_AGENT,
  SKIP_TIER_AGENT,
  TO_ADVANCED_AGENT,
} from "../fixtures/ai/reference-escalation";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";

const BASIC_MODEL = "fake-model-1";
const BASIC_FALLBACK_MODEL = "fake-model-2";
const INVALID = fakeOutput({ unexpected: true });
const VALID = fakeOutput({ summary: "resumo" });
const VALID_ITEMS = fakeOutput({ items: [{ id: "i1", label: "Item" }] });

describe("009/US4 escalonamento só por regra explícita, uma vez, ao nível seguinte", () => {
  let t: AiTestApp;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp(ESCALATION_DEFINITIONS);
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  /** Requests one execution of `agentKey`, runs it to its end, and returns it with its legs in order. */
  async function run(agentKey: string) {
    const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { escalationModelConfig: true, proposal: true, modelCallRows: { orderBy: { sequence: "asc" }, include: { modelConfig: true } } },
    });
  }
  const legs = (execution: Awaited<ReturnType<typeof run>>) =>
    execution.modelCallRows.map((call) => ({ key: call.modelConfig.key, tier: call.tier, status: call.status, isFallback: call.isFallback, isEscalation: call.isEscalation }));
  const models = () => t.provider.requests.map((request) => request.model);
  const escalatedEvents = () => t.prisma.auditEvent.findMany({ where: { type: "ai_execution.escalated" } });

  it("009/US4-3 saída inválida com escalonamento permitido → uma chamada a mais no STANDARD, registrada na execução e auditada", async () => {
    t.provider.scriptFor(BASIC_MODEL, INVALID);
    t.provider.scriptFor(FAKE_STANDARD.model, VALID);
    const execution = await run(ESCALATING_AGENT.key);

    expect(execution).toMatchObject({
      status: "COMPLETED",
      tier: "BASIC",
      escalationUsed: true,
      escalationFromTier: "BASIC",
      escalationToTier: "STANDARD",
      escalationReason: "OUTPUT_INVALID",
      escalationModelConfig: { key: FAKE_STANDARD.key },
      fallbackUsed: false,
      modelCalls: 2,
    });
    expect(legs(execution)).toEqual([
      { key: "fake-default", tier: "BASIC", status: "SUCCEEDED", isFallback: false, isEscalation: false },
      { key: FAKE_STANDARD.key, tier: "STANDARD", status: "SUCCEEDED", isFallback: false, isEscalation: true },
    ]);
    expect(models()).toEqual([BASIC_MODEL, FAKE_STANDARD.model]);
    // The escalated call repeats the last logical call: the same request, on the other model.
    const [first, second] = t.provider.requests;
    expect({ ...second, model: first!.model }).toEqual(first);

    const events = await escalatedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorType: "SYSTEM", targetType: "AI_EXECUTION", targetId: execution.id });
    expect(events[0]!.metadata).toEqual({ taskKey: ESCALATING_TASK.key, fromTier: "BASIC", toTier: "STANDARD", reason: "OUTPUT_INVALID", modelConfigKey: FAKE_STANDARD.key });
  });

  it("009/US4-3 uma saída que nem é JSON também escala", async () => {
    t.provider.scriptFor(BASIC_MODEL, fakeText("isto não é JSON"));
    t.provider.scriptFor(FAKE_STANDARD.model, VALID);
    expect(await run(ESCALATING_AGENT.key)).toMatchObject({ status: "COMPLETED", escalationUsed: true });
  });

  it("009/US4-4 sem permissão de escalonar → falha como na 006, sem outro nível", async () => {
    t.provider.scriptFor(BASIC_MODEL, INVALID);
    t.provider.scriptFor(FAKE_STANDARD.model, VALID);
    const execution = await run(NO_ESCALATION_AGENT.key);
    expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: false, escalationToTier: null, modelCalls: 1 });
    expect(models()).toEqual([BASIC_MODEL]);
    expect(await escalatedEvents()).toEqual([]);
  });

  describe("009/US4-5 009/FR-013 009/FR-014 009/SC-006 nunca mais de um escalonamento nem além do teto", () => {
    it("a saída escalonada também inválida → falha com o código original, sem segundo escalonamento", async () => {
      t.provider.scriptFor(BASIC_MODEL, INVALID);
      t.provider.scriptFor(FAKE_STANDARD.model, INVALID);
      t.provider.scriptFor(FAKE_ADVANCED.model, VALID);
      const execution = await run(ESCALATING_AGENT.key);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: true, escalationToTier: "STANDARD", modelCalls: 2 });
      expect(models()).toEqual([BASIC_MODEL, FAKE_STANDARD.model]);
      expect(await escalatedEvents()).toHaveLength(1);
    });

    it("com o teto em STANDARD e só um ADVANCED aprovado acima, não escala: nunca pula nível", async () => {
      t.provider.scriptFor(BASIC_MODEL, INVALID);
      t.provider.scriptFor(FAKE_ADVANCED.model, VALID);
      const execution = await run(SKIP_TIER_AGENT.key);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: false });
      expect(models()).not.toContain(FAKE_ADVANCED.model);
    });

    it("ADVANCED só quando a política o permite explicitamente como destino", async () => {
      t.provider.scriptFor(FAKE_STANDARD.model, INVALID);
      t.provider.scriptFor(FAKE_ADVANCED.model, VALID);
      const execution = await run(TO_ADVANCED_AGENT.key);
      expect(execution).toMatchObject({ status: "COMPLETED", tier: "STANDARD", escalationFromTier: "STANDARD", escalationToTier: "ADVANCED", escalationModelConfig: { key: FAKE_ADVANCED.key } });
      expect(models()).toEqual([FAKE_STANDARD.model, FAKE_ADVANCED.model]);
    });

    it("uma tarefa BASIC com teto STANDARD nunca chega a ADVANCED, mesmo aprovado", async () => {
      t.provider.scriptFor(BASIC_MODEL, INVALID);
      t.provider.scriptFor(FAKE_STANDARD.model, INVALID);
      await run(ESCALATING_AGENT.key);
      expect(await t.prisma.aiModelCall.count({ where: { tier: "ADVANCED" } })).toBe(0);
    });

    it("sem folga em maxModelCalls, não escala", async () => {
      t.provider.scriptFor(BASIC_MODEL, INVALID);
      t.provider.scriptFor(FAKE_STANDARD.model, VALID);
      const execution = await run(ONE_CALL_AGENT.key);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: false, modelCalls: 1 });
      expect(models()).toEqual([BASIC_MODEL]);
    });

    it("com o STANDARD indisponível (desabilitado), falha com o código original, sem outro nível", async () => {
      await t.prisma.aiModelConfig.update({ where: { key: FAKE_STANDARD.key }, data: { status: "DISABLED" } });
      t.provider.scriptFor(BASIC_MODEL, INVALID);
      const execution = await run(ESCALATING_AGENT.key);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", escalationUsed: false });
      expect(models()).toEqual([BASIC_MODEL]);
    });

    it("uma falha técnica nunca escala: o fallback é do mesmo nível e o erro continua o da 008", async () => {
      t.provider.scriptFor(BASIC_MODEL, fakeError("UNAVAILABLE"));
      t.provider.scriptFor(BASIC_FALLBACK_MODEL, fakeError("UNAVAILABLE"));
      t.provider.scriptFor(FAKE_STANDARD.model, VALID);
      const execution = await run(ESCALATING_AGENT.key);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_ERROR", escalationUsed: false, fallbackUsed: true });
      expect(models()).not.toContain(FAKE_STANDARD.model);
    });
  });

  it("009/US4-6 a rejeição da proposta não é falha de qualidade: o novo pedido usa o mesmo nível", async () => {
    t.provider.scriptFor(BASIC_MODEL, VALID_ITEMS);
    const first = await run(ESCALATING_L2_AGENT.key);
    expect(first).toMatchObject({ status: "COMPLETED", tier: "BASIC", escalationUsed: false });
    const rejected = await api(t, { cookie }).post(`/api/ai/proposals/${first.proposal!.id}/decision`, { decision: "REJECT" });
    expect(rejected.status).toBe(200);

    const again = await run(ESCALATING_L2_AGENT.key);
    expect(again).toMatchObject({ status: "COMPLETED", tier: "BASIC", escalationUsed: false });
    expect(legs(again).map((leg) => leg.tier)).toEqual(["BASIC"]);
    expect(await escalatedEvents()).toEqual([]);
  });

  it("009/FR-015 fallback e escalonamento na mesma execução ficam registrados separadamente", async () => {
    t.provider.scriptFor(BASIC_MODEL, fakeError("UNAVAILABLE"));
    t.provider.scriptFor(BASIC_FALLBACK_MODEL, INVALID);
    t.provider.scriptFor(FAKE_STANDARD.model, VALID);
    const execution = await run(ESCALATING_AGENT.key);

    expect(execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true, escalationUsed: true, escalationFromTier: "BASIC", escalationToTier: "STANDARD", modelCalls: 3 });
    expect(legs(execution)).toEqual([
      { key: "fake-default", tier: "BASIC", status: "FAILED", isFallback: false, isEscalation: false },
      { key: "fake-alt", tier: "BASIC", status: "SUCCEEDED", isFallback: true, isEscalation: false },
      { key: FAKE_STANDARD.key, tier: "STANDARD", status: "SUCCEEDED", isFallback: false, isEscalation: true },
    ]);
    const types = (await t.prisma.auditEvent.findMany({ where: { targetId: execution.id }, orderBy: { id: "asc" } })).map((event) => event.type);
    expect(types.filter((type) => type === "ai_execution.fallback_used" || type === "ai_execution.escalated")).toEqual([
      "ai_execution.fallback_used",
      "ai_execution.escalated",
    ]);
  });
});
