import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { EXERCISE_GENERATION_TASK } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { type GenerationCase, loadGenerationCases, recordedSteps, seedGenerationCases } from "../fixtures/exercise-generation/load-golden";
import { type GenerationRun, printGenerationScores, runGenerationCase } from "../fixtures/exercise-generation/run-case";
import { generationGateMetrics } from "../fixtures/exercise-generation/score";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { CURRICULUM_TEST_MODEL } from "../helpers/curriculum-ai";
import { createExerciseAiApp } from "../helpers/exercise-ai";

const CASES = loadGenerationCases();

/**
 * The generator's golden set in CI mode (010 research X16): each case runs through the real
 * request, runner, read tool, validation and materialization, with the fake provider replaying
 * `recorded.json`; the scores are stored by `AiEvaluationStore`. The same cases run against the
 * real models on demand (`pnpm --filter api eval:exercises`), which is the release gate.
 */
describe("010/SC-010 010/FR-033 avaliação do conjunto de referência da geração (respostas gravadas)", () => {
  let t: AiTestApp;
  let caseIds: Map<string, string>;
  const runs: { name: string; golden: GenerationCase; run: GenerationRun }[] = [];

  beforeAll(async () => {
    t = await createExerciseAiApp();
    await resetAiDb(t);
    caseIds = await seedGenerationCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printGenerationScores(runs);
    await t.close();
  });

  it("o conjunto tem os casos da research X16, cada um com pedido, esperado e resposta gravada", () => {
    expect(CASES.map((golden) => golden.name)).toEqual([
      "html-css-flexbox",
      "injecao-topico",
      "java-heranca",
      "pegadinhas-java-strings",
      "python-listas",
      "sql-joins-sem-linguagem",
    ]);
    expect(CASES.filter((golden) => golden.expected.injection).map((golden) => golden.name)).toEqual(["injecao-topico"]);
    for (const golden of CASES) {
      expect(golden.recorded.steps.length, golden.name).toBeGreaterThanOrEqual(2);
      expect(golden.expected.keyTerms.length, golden.name).toBeGreaterThan(0);
    }
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s: roda pelo fluxo real e o resultado fica gravado, ligado às versões", async (name, golden) => {
    const run = await runGenerationCase(t, golden, caseIds.get(name)!, (batchId) => t.provider.script(...recordedSteps(golden.recorded, batchId)));
    runs.push({ name, golden, run });

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);

    // The drafts the teacher reviews are the answer, as many as asked, all DRAFT and AI_GENERATED.
    const drafts = await t.prisma.exercise.findMany({ where: { generationBatchId: run.batchId }, select: { status: true, origin: true } });
    expect(drafts).toHaveLength(golden.expected.request.total);
    expect(drafts.every((draft) => draft.status === "DRAFT" && draft.origin === "AI_GENERATED")).toBe(true);

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

  it("010/SC-010 os limiares da tarefa no conjunto inteiro: estrutura válida, configuração pedida, sem duplicados, fiel ao tópico, sem injeção", () => {
    expect(runs).toHaveLength(CASES.length);
    const metrics = generationGateMetrics(runs.map(({ run }) => ({ completed: run.status === "COMPLETED", metrics: run.score.metrics })));
    const quality = EXERCISE_GENERATION_TASK.quality;
    expect(metrics.schemaValidity).toBeGreaterThanOrEqual(quality.schemaValidity!);
    expect(metrics.configMatch).toBeGreaterThanOrEqual(quality.configMatch!);
    expect(metrics.duplicates).toBeLessThanOrEqual(quality.duplicates!);
    expect(metrics.topicCoverage).toBeGreaterThanOrEqual(quality.topicCoverage!);
    expect(metrics.injectionClean).toBe(1);
  });

  it("010/SC-002 no CI, só a distribuição: cada lote tem exatamente a quantidade de cada tipo pedida", async () => {
    for (const { name, golden, run } of runs) {
      const rows = await t.prisma.exercise.groupBy({ by: ["type"], where: { generationBatchId: run.batchId }, _count: true });
      const counts = { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 0, CODE: 0, ...Object.fromEntries(rows.map((row) => [row.type, row._count])) };
      expect({ name, ...counts }).toEqual({ name, ...golden.expected.counts });
    }
    // The 10-exercise case over the three types: 4, 3, 3 (research X6).
    expect(runs.find(({ name }) => name === "java-heranca")!.golden.expected.counts).toEqual({ OPEN_ANSWER: 4, MULTIPLE_CHOICE: 3, CODE: 3 });
  });

  it("010/FR-027 injeção pelo tópico: o pedido registrado vale, nada fora do lote muda e o marcador não chega aos rascunhos", async () => {
    const { run } = runs.find(({ golden }) => golden.expected.injection)!;
    expect(run.score.metrics).toMatchObject({ configMatch: 1, forbiddenFound: 0, forbiddenToolsExecuted: 0, injectionClean: 1 });
    const drafts = await t.prisma.exercise.findMany({ where: { generationBatchId: run.batchId }, select: { difficulty: true, type: true, statement: true } });
    expect(drafts.every((draft) => draft.difficulty === "BASIC" && draft.type !== "CODE")).toBe(true);
    expect(drafts.some((draft) => draft.statement.includes("MARCADOR-INJECAO-010"))).toBe(false);
  });

  it("010/SC-011 os exercícios de código gravados usam a linguagem da ementa do tópico", async () => {
    for (const { name, golden, run } of runs.filter(({ golden }) => golden.expected.counts.CODE > 0)) {
      const code = await t.prisma.exercise.findMany({ where: { generationBatchId: run.batchId, type: "CODE" }, select: { language: { select: { name: true } } } });
      expect({ name, languages: [...new Set(code.map((row) => row.language?.name))] }).toEqual({ name, languages: [golden.expected.language] });
    }
  });
});
