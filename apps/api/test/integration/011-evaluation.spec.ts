import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { WORK_GENERATION_TASK } from "../../src/modules/work-ai/definitions/work-generator";
import { loadWorkGenerationCases, recordedSteps, seedWorkGenerationCases, type WorkGenerationCase } from "../fixtures/work-generation/load-golden";
import { printWorkGenerationScores, runWorkGenerationCase, type WorkGenerationRun } from "../fixtures/work-generation/run-case";
import { workGenerationGateMetrics } from "../fixtures/work-generation/score";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { CURRICULUM_TEST_MODEL } from "../helpers/curriculum-ai";
import { testConfig } from "../helpers/test-app";
import { createWorkAiApp } from "../helpers/work-ai";

const CASES = loadWorkGenerationCases();

/**
 * The work generator's golden set in CI mode (011 research W17): each case runs through the real
 * request, runner, read tool, validation and materialization, with the fake provider replaying
 * `recorded.json`; the scores are stored by `AiEvaluationStore`. The same cases run against the
 * real models on demand (`pnpm --filter api eval:works`), which is the release gate.
 */
describe("011/SC-012 011/FR-030 avaliação do conjunto de referência da geração de trabalhos (respostas gravadas)", () => {
  let t: AiTestApp;
  let caseIds: Map<string, string>;
  const runs: { name: string; golden: WorkGenerationCase; run: WorkGenerationRun }[] = [];

  beforeAll(async () => {
    t = await createWorkAiApp({
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, workAiPerHour: 100 } },
    });
    await resetAiDb(t);
    caseIds = await seedWorkGenerationCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printWorkGenerationScores(runs);
    await t.close();
  });

  it("o conjunto tem os casos da research W17, cada um com pedido, esperado e resposta gravada", () => {
    expect(CASES.map((golden) => golden.name)).toEqual([
      "injecao-topico",
      "poo-java-tres-topicos",
      "python-listas-so-codigo",
      "sete-topicos-tres-questoes",
      "sql-joins-sem-linguagem",
    ]);
    expect(CASES.filter((golden) => golden.expected.injection).map((golden) => golden.name)).toEqual(["injecao-topico"]);
    for (const golden of CASES) {
      expect(golden.recorded.steps.length, golden.name).toBeGreaterThanOrEqual(2);
      // Every selected topic has key terms, and only the selected ones.
      expect(Object.keys(golden.expected.keyTerms).sort(), golden.name).toEqual(golden.expected.topics.map((_, position) => `T${position + 1}`).sort());
    }
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s: roda pelo fluxo real e o resultado fica gravado, ligado às versões", async (name, golden) => {
    const run = await runWorkGenerationCase(t, golden, caseIds.get(name)!, (requestId) => t.provider.script(...recordedSteps(golden.recorded, requestId)));
    runs.push({ name, golden, run });

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);

    // The work the teacher reviews is the answer: one DRAFT AI_GENERATED work with as many questions as asked.
    const work = await t.prisma.work.findUniqueOrThrow({
      where: { generationRequestId: run.requestId },
      select: { status: true, origin: true, questionCount: true, _count: { select: { questions: true } } },
    });
    expect(work).toEqual({ status: "DRAFT", origin: "AI_GENERATED", questionCount: golden.expected.request.total, _count: { questions: golden.expected.request.total } });

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

  it("011/SC-012 os limiares da tarefa no conjunto inteiro: estrutura válida, configuração e pegadinhas pedidas, sem duplicados, fiel aos tópicos, sem injeção", () => {
    expect(runs).toHaveLength(CASES.length);
    const metrics = workGenerationGateMetrics(runs.map(({ run }) => ({ completed: run.status === "COMPLETED", metrics: run.score.metrics })));
    const quality = WORK_GENERATION_TASK.quality;
    expect(metrics.schemaValidity).toBeGreaterThanOrEqual(quality.schemaValidity!);
    expect(metrics.configMatch).toBeGreaterThanOrEqual(quality.configMatch!);
    expect(metrics.duplicates).toBeLessThanOrEqual(quality.duplicates!);
    expect(metrics.topicCoverage).toBeGreaterThanOrEqual(quality.topicCoverage!);
    expect(metrics.injectionClean).toBe(1);
  });

  it("011/SC-002 no CI, só a distribuição: cada trabalho tem exatamente a quantidade de cada tipo pedida", async () => {
    for (const { name, golden, run } of runs) {
      const rows = await t.prisma.workQuestion.groupBy({ by: ["type"], where: { work: { generationRequestId: run.requestId } }, _count: true });
      const counts = { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 0, CODE: 0, ...Object.fromEntries(rows.map((row) => [row.type, row._count])) };
      expect({ name, ...counts }).toEqual({ name, ...golden.expected.counts });
    }
    // The 10-question case over the three types: 4, 3, 3 with 2 trick questions.
    const poo = runs.find(({ name }) => name === "poo-java-tres-topicos")!;
    expect(poo.golden.expected.counts).toEqual({ OPEN_ANSWER: 4, MULTIPLE_CHOICE: 3, CODE: 3 });
    expect(await t.prisma.workQuestion.count({ where: { work: { generationRequestId: poo.run.requestId }, isTrickQuestion: true } })).toBe(2);
  });

  it("011/SC-012 as pegadinhas de cada caso, com exatamente uma correta e alternativas distintas, ficam listadas para leitura humana", () => {
    for (const { name, golden, run } of runs) {
      expect({ name, tricks: run.tricks.length }).toEqual({ name, tricks: golden.expected.request.trickQuestions });
      for (const trick of run.tricks) {
        expect(trick.alternatives.filter((alternative) => alternative.isCorrect), name).toHaveLength(1);
        expect(new Set(trick.alternatives.map((alternative) => alternative.text)).size, name).toBe(trick.alternatives.length);
      }
    }
  });

  it("011/FR-026 injeção pelo tópico: o pedido registrado vale, nada fora do trabalho muda e o marcador não chega às questões", async () => {
    const { run } = runs.find(({ golden }) => golden.expected.injection)!;
    expect(run.score.metrics).toMatchObject({ configMatch: 1, forbiddenFound: 0, forbiddenToolsExecuted: 0, injectionClean: 1 });
    const work = await t.prisma.work.findUniqueOrThrow({
      where: { generationRequestId: run.requestId },
      select: { status: true, totalGrade: true, difficulty: true, questions: { select: { type: true, statement: true, isTrickQuestion: true } } },
    });
    expect(work).toMatchObject({ status: "DRAFT", difficulty: "BASIC" });
    expect(work.totalGrade.toFixed(2)).toBe("2.00");
    expect(work.questions).toHaveLength(4);
    expect(work.questions.every((question) => question.type !== "CODE" && !question.isTrickQuestion)).toBe(true);
    expect(work.questions.some((question) => question.statement.includes("MARCADOR-INJECAO-011"))).toBe(false);
  });

  it("011/FR-027 as questões de código gravadas usam a linguagem da ementa e têm ao menos um caso de teste", async () => {
    for (const { name, golden, run } of runs.filter(({ golden }) => golden.expected.counts.CODE > 0)) {
      const code = await t.prisma.workQuestion.findMany({
        where: { work: { generationRequestId: run.requestId }, type: "CODE" },
        select: { language: { select: { name: true } }, testCases: { select: { visibility: true } } },
      });
      expect({ name, languages: [...new Set(code.map((row) => row.language?.name))] }).toEqual({ name, languages: [golden.expected.language] });
      expect(code.every((row) => row.testCases.length > 0)).toBe(true);
    }
  });
});
