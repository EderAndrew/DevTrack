import { CurriculumProposalContentSchema, type CurriculumExtractionOutput } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { FALLBACK_MODEL_CONFIG_KEY } from "../../src/modules/ai/definitions/model-config-keys";
import { AI_DEFINITIONS, defineModelConfig } from "../../src/modules/ai/definitions/types";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { FakeModelProvider, fakeDelay, fakeError, fakeOutput, fakeText, fakeToolCall, type FakeStep } from "../fixtures/ai/fake-model-provider";
import { drain, resetAiDb } from "../helpers/ai";
import {
  CURRICULUM_TEST_MODEL,
  curriculumTestDefinitions,
  pooOutput,
  requestAnalysis,
  seedProcessedDocument,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, type TestApp, testConfig } from "../helpers/test-app";

const PRIMARY = CURRICULUM_TEST_MODEL;
const FALLBACK = "openai/gpt-5.5";

/** The fallback config of production (`OPENROUTER_FALLBACK_MODEL`), on the simulated provider. */
const FALLBACK_CONFIG = defineModelConfig({
  ...TEST_CURRICULUM_MODEL_CONFIG,
  key: FALLBACK_MODEL_CONFIG_KEY,
  model: FALLBACK,
  price: { inputPerMTok: "2", outputPerMTok: "8", currency: "USD" },
});

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("waitFor: timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("008/US3 uma falha recuperável do principal cai no fallback, com limite", () => {
  const provider = new FakeModelProvider();
  let t: TestApp;
  let teacher: TestUser;
  let cookie: string;
  let document: SyllabusDocument;

  beforeAll(async () => {
    // The Curriculum Agent's task with the fallback production adds when it is configured.
    const definitions = curriculumTestDefinitions(provider);
    definitions.modelConfigs = [...definitions.modelConfigs, FALLBACK_CONFIG];
    definitions.tasks = definitions.tasks.map((task) =>
      task.key === "curriculum-extraction" ? { ...task, fallbackModelConfigKey: FALLBACK_CONFIG.key } : task,
    );
    const base = testConfig();
    t = await createTestApp({
      config: { rateLimit: { ...base.rateLimit, curriculumAiPerHour: 1_000, aiExecutionsPerMinute: 1_000, aiAgentPerHour: 1_000 } },
      overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }],
    });
    // No real waits between retries.
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(Object.assign(t, { provider }));
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
  });

  const primaryDown = () => provider.scriptFor(PRIMARY, fakeError("UNAVAILABLE"));
  const fallbackRun = (documentId: string, output: unknown = pooOutput()) =>
    provider.scriptFor(FALLBACK, fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId }), fakeOutput(output));
  const primaryRun = (...steps: FakeStep[]) => provider.scriptFor(PRIMARY, ...steps);
  const models = () => provider.requests.map((request) => request.model);
  const calls = (executionId: string) => t.prisma.aiModelCall.findMany({ where: { executionId }, orderBy: { sequence: "asc" } });
  const analyse = async (doc: SyllabusDocument = document) => {
    const res = await requestAnalysis(t, cookie, doc.id);
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id }, include: { proposal: true } });
  };

  it("008/US3-1 principal indisponível e fallback válido → proposta; as pernas, fallback_used e o evento de fallback", async () => {
    primaryDown();
    fallbackRun(document.id);
    const execution = await analyse();

    expect(execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true, model: PRIMARY });
    expect(execution.proposal).toMatchObject({ status: "READY_FOR_REVIEW" });
    const retries = t.config.ai.limits.maxRetries;
    // Two logical calls (read the document, then the output), each primary → fallback.
    expect((await calls(execution.id)).map((call) => [call.model, call.status, call.isFallback, call.attempts])).toEqual([
      [PRIMARY, "FAILED", false, retries + 1],
      [FALLBACK, "SUCCEEDED", true, 1],
      [PRIMARY, "FAILED", false, retries + 1],
      [FALLBACK, "SUCCEEDED", true, 1],
    ]);
    const events = await t.prisma.auditEvent.findMany({ where: { type: "ai_execution.fallback_used", targetId: execution.id } });
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event).toMatchObject({
        actorType: "SYSTEM",
        targetType: "AI_EXECUTION",
        metadata: { primaryConfigKey: TEST_CURRICULUM_MODEL_CONFIG.key, fallbackConfigKey: FALLBACK_CONFIG.key, reason: "PROVIDER_FAILURE", primaryErrorCode: "AI_PROVIDER_ERROR" },
      });
    }
  });

  describe("008/US3-2 erro permanente ou saída inválida no principal → sem fallback, código da 006", () => {
    it.each([
      ["requisição inválida", fakeError("INVALID_REQUEST"), "AI_PROVIDER_ERROR"],
      ["autenticação", fakeError("AUTH"), "AI_MODEL_UNAVAILABLE"],
      ["saída fora do schema", fakeOutput({ campoInventado: true }), "AI_OUTPUT_VALIDATION_FAILED"],
      ["saída que não é JSON", fakeText("não é JSON"), "AI_OUTPUT_PARSE_FAILED"],
    ] as const)("%s", async (_name, step, code) => {
      primaryRun(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: document.id }), step);
      fallbackRun(document.id);
      const execution = await analyse();
      expect(execution).toMatchObject({ status: "FAILED", errorCode: code, fallbackUsed: false });
      expect(models()).not.toContain(FALLBACK);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.fallback_used" } })).toBe(0);
    });
  });

  it("008/US3-3 principal e fallback falhando com erro recuperável → falha controlada, chamadas no limite, sem voltar ao principal", async () => {
    primaryDown();
    provider.scriptFor(FALLBACK, fakeError("RATE_LIMITED"));
    const execution = await analyse();
    const perLeg = t.config.ai.limits.maxRetries + 1;

    expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_RATE_LIMITED", fallbackUsed: true });
    expect(models()).toEqual([...Array<string>(perLeg).fill(PRIMARY), ...Array<string>(perLeg).fill(FALLBACK)]);
    expect((await calls(execution.id)).map((call) => [call.model, call.isFallback])).toEqual([
      [PRIMARY, false],
      [FALLBACK, true],
    ]);
  });

  it("008/US3-4 prazo da execução esgotado durante o principal → sem fallback, TIMED_OUT", async () => {
    primaryRun(fakeDelay(5_000, fakeOutput(pooOutput())));
    fallbackRun(document.id);
    const res = await requestAnalysis(t, cookie, document.id);
    await t.prisma.aiExecution.update({ where: { id: res.body.execution.id }, data: { deadlineAt: new Date(Date.now() + 300) } });
    await drain(t);

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id } });
    expect(execution).toMatchObject({ status: "TIMED_OUT", fallbackUsed: false });
    expect(models()).not.toContain(FALLBACK);
  });

  it("008/US3-5 tarefa sem fallback → comportamento da 006 (novas tentativas e falha controlada)", async () => {
    // A request made before the fallback existed keeps its route (research G5).
    primaryDown();
    fallbackRun(document.id);
    const res = await requestAnalysis(t, cookie, document.id);
    await t.prisma.aiExecution.update({ where: { id: res.body.execution.id }, data: { fallbackModelConfigId: null } });
    await drain(t);

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id } });
    expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_ERROR", fallbackUsed: false });
    expect(models()).toEqual(Array<string>(t.config.ai.limits.maxRetries + 1).fill(PRIMARY));
  });

  it("008/US3-6 cancelamento durante o principal → o fallback não é chamado", async () => {
    primaryRun(fakeDelay(2_000, fakeError("UNAVAILABLE")));
    fallbackRun(document.id);
    const { body } = await requestAnalysis(t, cookie, document.id);
    const running = t.get(AiExecutionWorker).runOnce();
    await waitFor(() => provider.requests.length === 1);
    expect((await api(t, { cookie }).post(`/api/ai/executions/${body.execution.id}/cancel`, {})).status).toBe(200);
    await running;

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id } });
    expect(execution).toMatchObject({ status: "CANCELLED", fallbackUsed: false });
    expect(models()).toEqual([PRIMARY]);
  });

  it("008/FR-012 a resposta do fallback passa pela validação e pela fundamentação da 007", async () => {
    primaryDown();
    const invented: CurriculumExtractionOutput = { ...pooOutput(), competencyText: "Projetar sistemas distribuídos tolerantes a falhas." };
    fallbackRun(document.id, invented);
    const execution = await analyse();
    const content = CurriculumProposalContentSchema.parse(execution.proposal!.payload);
    expect(content.grounding.unsupported).toContainEqual({ field: "competencyText", groupIndex: null, itemIndex: null });

    // An output out of the schema from the fallback fails the execution, as in 007.
    const { document: other } = await seedProcessedDocument(t, teacher.id);
    provider.scriptFor(FALLBACK, fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: other.id }), fakeOutput({ campoInventado: true }));
    expect(await analyse(other)).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_VALIDATION_FAILED", fallbackUsed: true });
  });

  it("principal desabilitado pelo administrador → a execução usa o fallback direto", async () => {
    await t.prisma.aiModelConfig.update({ where: { key: TEST_CURRICULUM_MODEL_CONFIG.key }, data: { status: "DISABLED" } });
    primaryRun(fakeOutput(pooOutput()));
    fallbackRun(document.id);
    const execution = await analyse();

    expect(execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true });
    expect(models()).toEqual([FALLBACK, FALLBACK]);
    expect((await calls(execution.id)).map((call) => call.isFallback)).toEqual([true, true]);
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.fallback_used", targetId: execution.id } });
    expect(event.metadata).toMatchObject({ reason: "PROVIDER_FAILURE", primaryErrorCode: "AI_MODEL_UNAVAILABLE" });
  });

  it("008/SC-004 20 análises com o principal fora do ar e o fallback saudável → pelo menos 19 com proposta", async () => {
    primaryDown();
    let withProposal = 0;
    for (let i = 0; i < 20; i += 1) {
      const { document: doc } = await seedProcessedDocument(t, teacher.id);
      fallbackRun(doc.id);
      const execution = await analyse(doc);
      if (execution.status === "COMPLETED" && execution.proposal) withProposal += 1;
    }
    expect(withProposal).toBeGreaterThanOrEqual(19);
  });
});
