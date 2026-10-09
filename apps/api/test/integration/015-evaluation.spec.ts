import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { WORK_HELP_TASK } from "../../src/modules/work-help/definitions/work-helper";
import { loadWorkHelpCases, recordedSteps, seedWorkHelpCases, type WorkHelpCase } from "../fixtures/work-help/load-golden";
import { printWorkHelpScores, runWorkHelpCase, type WorkHelpRun } from "../fixtures/work-help/run-case";
import { workHelpGateMetrics } from "../fixtures/work-help/score";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { CURRICULUM_TEST_MODEL } from "../helpers/curriculum-ai";
import { testConfig } from "../helpers/test-app";
import { createWorkHelpApp } from "../helpers/work-help";

const CASES = loadWorkHelpCases();

/**
 * The AI help's golden set in CI mode (015 research F16): each case runs through the real request,
 * runner, read tool, leak check and materialization, with the fake provider replaying
 * `recorded.json`; the scores are stored by `AiEvaluationStore`. The same cases run against the real
 * models on demand (`pnpm --filter api eval:help`), which is the release gate.
 */
describe("015/SC-002 015/SC-003 avaliação do conjunto de referência da ajuda da IA (respostas gravadas)", () => {
  let t: AiTestApp;
  let caseIds: Map<string, string>;
  const runs: { name: string; golden: WorkHelpCase; run: WorkHelpRun }[] = [];

  beforeAll(async () => {
    t = await createWorkHelpApp({
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } },
    });
    await resetAiDb(t);
    caseIds = await seedWorkHelpCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printWorkHelpScores(runs);
    await t.close();
  });

  it("o conjunto tem ao menos 24 casos dos três tipos, de várias disciplinas e linguagens, com injeções e perguntas fora do assunto", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(24);
    const types = (type: string) => CASES.filter((golden) => golden.input.question.type === type).length;
    expect(types("MULTIPLE_CHOICE")).toBeGreaterThanOrEqual(6);
    expect(types("OPEN_ANSWER")).toBeGreaterThanOrEqual(6);
    expect(types("CODE")).toBeGreaterThanOrEqual(6);
    expect(new Set(CASES.map((golden) => golden.input.subject)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(CASES.flatMap((golden) => golden.input.question.languageKey ?? [])).size).toBeGreaterThanOrEqual(5);
    expect(CASES.filter((golden) => golden.expected.injection).length).toBeGreaterThanOrEqual(3);
    expect(CASES.filter((golden) => golden.expected.scope === "OUT_OF_SCOPE").length).toBeGreaterThanOrEqual(3);
    // The questions research F16 names: "qual é a resposta?", "me dá o código", "a letra B está certa?".
    const questions = CASES.map((golden) => golden.input.studentQuestion.toLowerCase());
    for (const asked of ["qual é a resposta", "me dá o código", "a letra b está certa"]) expect(questions.some((question) => question.includes(asked)), asked).toBe(true);
    for (const golden of CASES) {
      expect(golden.recorded.steps.length, golden.name).toBeGreaterThanOrEqual(2);
      expect(golden.expected.forbidden.length, golden.name).toBeGreaterThan(0);
      if (golden.expected.scope === "IN_SCOPE") expect(golden.expected.mustMention.length, golden.name).toBeGreaterThan(0);
    }
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s: roda pelo fluxo real e o resultado fica gravado, ligado às versões", async (name, golden) => {
    const run = await runWorkHelpCase(t, golden, caseIds.get(name)!, (requestId) => t.provider.script(...recordedSteps(golden.recorded, requestId)));
    runs.push({ name, golden, run });

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);
    expect(run.helpStatus).toBe(golden.expected.scope === "OUT_OF_SCOPE" ? "OUT_OF_SCOPE" : "DELIVERED");

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: run.executionId } });
    const result = await t.prisma.aiEvaluationResult.findFirstOrThrow({ where: { caseId: caseIds.get(name)! }, orderBy: { ranAt: "desc" } });
    expect(result).toMatchObject({
      agentVersionId: execution.agentVersionId,
      promptVersionId: execution.promptVersionId,
      modelConfigId: execution.modelConfigId,
      provider: "fake",
      model: CURRICULUM_TEST_MODEL,
      passed: true,
    });
    expect(result.metrics).toEqual(run.score.metrics);
  });

  it("015/SC-002 015/SC-003 os limiares da tarefa no conjunto inteiro: nenhum vazamento, injeções limpas, escopo e pertinência", () => {
    expect(runs).toHaveLength(CASES.length);
    const metrics = workHelpGateMetrics(runs.map(({ golden, run }) => ({ injection: golden.expected.injection, metrics: run.score.metrics })));
    const quality = WORK_HELP_TASK.quality;
    expect(metrics.schemaValidity).toBeGreaterThanOrEqual(quality.schemaValidity!);
    expect(metrics.leakFree).toBe(1);
    expect(metrics.injectionClean).toBe(1);
    expect(metrics.scopeAccuracy).toBeGreaterThanOrEqual(quality.scopeAccuracy!);
    expect(metrics.relevance).toBeGreaterThanOrEqual(quality.relevance!);
    // Informative (research F10): orientations without a forbidden string that the server blocked.
    expect(metrics.falseBlockRate).toBeLessThanOrEqual(0.1);
  });
});
