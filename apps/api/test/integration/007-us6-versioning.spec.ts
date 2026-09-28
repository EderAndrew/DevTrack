import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/modules/audit/audit.service";
import type { AgentDefinition } from "../../src/modules/ai/definitions/types";
import { AiRegistryError } from "../../src/modules/ai/registry/ai-definitions.check";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { CURRICULUM_AGENT_KEY } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  createCurriculumAiApp,
  curriculumTestDefinitions,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
  TEST_CURRICULUM_AGENT,
} from "../helpers/curriculum-ai";
import { createUser, loginAs } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const registered = (t: TestApp) =>
  t.prisma.aiAgent.findUniqueOrThrow({
    where: { key: CURRICULUM_AGENT_KEY },
    include: {
      versions: { orderBy: { version: "asc" }, include: { promptVersion: true, outputSchema: true, task: true, tools: { include: { tool: true } } } },
    },
  });

describe("007/US6-1 007/FR-051 007/FR-007 as definições de produção registram o curriculum-agent v1, desabilitado", () => {
  let t: TestApp;

  beforeAll(async () => {
    // The production definitions (no test override); no provider, since the test config has no key.
    t = await createTestApp();
    await resetDb(t.prisma);
    await t.get(AiRegistrySync).sync();
  });
  afterAll(() => t.close());

  it("curriculum-agent v1 L2_PROPOSAL assíncrono, instruções curriculum-extraction v1, esquema v1, configuração e só a ferramenta de leitura", async () => {
    const agent = await registered(t);
    expect(agent.status).toBe("DISABLED");
    expect(agent.versions).toHaveLength(1);
    const v1 = agent.versions[0]!;
    expect(agent.currentVersionId).toBe(v1.id);
    // 008: the production agent is v2, v1 with its task instead of a model config (research G4);
    // 010: v3, which also proposes the language (prompt v2, output schema v2).
    expect(v1).toMatchObject({
      version: 3,
      riskLevel: "L2_PROPOSAL",
      executionMode: "ASYNC",
      requiredPermission: "ementas.revisar",
      resourceTypes: ["SYLLABUS_DOCUMENT"],
      proposalType: "CURRICULUM_EXTRACTION",
      onToolDenied: "continue",
      usedAt: null,
    });
    expect(v1.promptVersion).toMatchObject({ key: "curriculum-extraction", version: 2 });
    expect(v1.outputSchema).toMatchObject({ version: 2 });
    // 009: the task carries the model policy (BASIC, research H12), never a model.
    expect(v1.task).toMatchObject({ key: "curriculum-extraction", preferredTier: "BASIC", policy: { preferredTier: "BASIC", maxTier: "STANDARD" } });
    expect(v1.tools.map((entry) => entry.tool.key)).toEqual([READ_CURRICULUM_DOCUMENT]);
    // Nothing else is registered in production: no reference agent; besides it, only the 010 generator and its tool.
    expect((await t.prisma.aiAgent.findMany({ select: { key: true }, orderBy: { key: "asc" } })).map((row) => row.key)).toEqual([CURRICULUM_AGENT_KEY, "exercise-generator"]);
    expect((await t.prisma.aiTool.findMany({ select: { key: true }, orderBy: { key: "asc" } })).map((row) => row.key)).toEqual([READ_CURRICULUM_DOCUMENT, "read-exercise-generation-request"]);
  });

  it("até o administrador habilitar, o status do documento é AGENT_DISABLED e o pedido é recusado", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const { document } = await seedProcessedDocument(t, teacher.id);

    const status = await getCurriculumAiStatus(t, cookie, document.id);
    expect(status.body.availability).toBe("AGENT_DISABLED");
    const request = await requestAnalysis(t, cookie, document.id);
    expect({ status: request.status, code: request.body.code }).toEqual({ status: 409, code: "AI_AGENT_DISABLED" });
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });
});

/** The next version of the agent: new instructions under the next prompt version; same key. */
const CHANGED_TEXT = "Instruções alteradas sem nova versão.";
const PROMPT = TEST_CURRICULUM_AGENT.prompt.version;
const V2: AgentDefinition = {
  ...TEST_CURRICULUM_AGENT,
  version: TEST_CURRICULUM_AGENT.version + 1,
  prompt: { ...TEST_CURRICULUM_AGENT.prompt, version: PROMPT + 1, systemInstructions: `${TEST_CURRICULUM_AGENT.prompt.systemInstructions}\nVersão 2.` },
};

describe("007/US6-2 007/FR-005 instruções v1 já usadas são imutáveis", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
  });

  const syncWith = (agent: AgentDefinition) =>
    new AiRegistrySync(curriculumTestDefinitions(t.provider, agent), t.config, t.prisma, t.get(AuditService)).onApplicationBootstrap();

  async function runV1(): Promise<string> {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { document } = await seedProcessedDocument(t, teacher.id);
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, await loginAs(t, teacher), document.id);
    await drain(t);
    return body.execution.id as string;
  }

  it("mudar o texto da v1 usada sem nova versão → a sincronização é recusada, e o registro não muda", async () => {
    await runV1();
    const changed = { ...TEST_CURRICULUM_AGENT, prompt: { ...TEST_CURRICULUM_AGENT.prompt, systemInstructions: CHANGED_TEXT } };

    const failure = await syncWith(changed).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiRegistryError);
    expect((failure as Error).message).not.toContain(CHANGED_TEXT);
    const prompt = await t.prisma.aiPromptVersion.findFirstOrThrow({ where: { key: "curriculum-extraction", version: PROMPT } });
    expect(prompt.systemInstructions).toBe(TEST_CURRICULUM_AGENT.prompt.systemInstructions);
  });

  it("publicar a v2 → aceita; a execução antiga continua ligada à v1 e a nova registra a v2", async () => {
    const old = await runV1();

    await syncWith(V2);

    const agent = await registered(t);
    expect(agent.versions.map((version) => [version.version, version.promptVersion.version])).toEqual([
      [TEST_CURRICULUM_AGENT.version, PROMPT],
      [TEST_CURRICULUM_AGENT.version + 1, PROMPT + 1],
    ]);
    expect(agent.currentVersionId).toBe(agent.versions[1]!.id);
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: old }, select: { agentVersion: true, promptVersion: true, agentVersionId: true } })).toEqual({
      agentVersion: TEST_CURRICULUM_AGENT.version,
      promptVersion: PROMPT,
      agentVersionId: agent.versions[0]!.id,
    });
    const v1Prompt = await t.prisma.aiPromptVersion.findFirstOrThrow({ where: { key: "curriculum-extraction", version: PROMPT } });
    expect(v1Prompt.systemInstructions).toBe(TEST_CURRICULUM_AGENT.prompt.systemInstructions);

    // A request after the "restart" runs on v2.
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { document } = await seedProcessedDocument(t, teacher.id);
    const { body } = await requestAnalysis(t, await loginAs(t, teacher), document.id);
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, select: { agentVersion: true, promptVersion: true } })).toEqual({
      agentVersion: TEST_CURRICULUM_AGENT.version + 1,
      promptVersion: PROMPT + 1,
    });
  });
});
