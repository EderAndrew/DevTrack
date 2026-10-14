import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { EXAM_GENERATION_TASK } from "../../src/modules/exam-ai/definitions/exam-generator";
import { type ExamGenerationCase, loadExamGenerationCases, recordedSteps, seedExamGenerationCases } from "../fixtures/exam-generator/load-golden";
import { type ExamGenerationRun, printExamGenerationScores, runExamGenerationCase } from "../fixtures/exam-generator/run-case";
import { examGenerationGateMetrics, topicKey } from "../fixtures/exam-generator/score";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { CURRICULUM_TEST_MODEL } from "../helpers/curriculum-ai";
import { createExamAiApp } from "../helpers/exam-ai";
import { testConfig } from "../helpers/test-app";

const CASES = loadExamGenerationCases();

/**
 * The exam generator's golden set in CI mode (018 research T14, T046): each case runs through the real
 * request, runner, read tool, validation and materialization, with the fake provider replaying
 * `recorded.json`; the scores are stored by `AiEvaluationStore`. The same cases run against the real
 * models on demand (`pnpm --filter api eval:exams`), which is the release gate.
 */
describe("018/FR-005 avaliação do conjunto de referência da geração de provas (respostas gravadas)", () => {
  let t: AiTestApp;
  let caseIds: Map<string, string>;
  const runs: { name: string; golden: ExamGenerationCase; run: ExamGenerationRun }[] = [];

  beforeAll(async () => {
    t = await createExamAiApp({
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, examGenerationsPerHour: 100 } },
    });
    await resetAiDb(t);
    caseIds = await seedExamGenerationCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printExamGenerationScores(runs);
    await t.close();
  });

  it("o conjunto tem os casos de referência, cada um com pedido, esperado e resposta gravada", () => {
    expect(CASES.map((golden) => golden.name)).toEqual(["injecao-topico", "poo-java-cinco-questoes", "python-vinte-questoes", "sql-sem-linguagem"]);
    expect(CASES.filter((golden) => golden.expected.injection).map((golden) => golden.name)).toEqual(["injecao-topico"]);
    for (const golden of CASES) {
      expect(golden.recorded.steps.length, golden.name).toBeGreaterThanOrEqual(2);
      expect(Object.keys(golden.expected.keyTerms).sort(), golden.name).toEqual(golden.expected.topics.map((_, position) => topicKey(position)).sort());
    }
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s: roda pelo fluxo real e o resultado fica gravado, ligado às versões", async (name, golden) => {
    const run = await runExamGenerationCase(t, golden, caseIds.get(name)!, (ids) => t.provider.script(...recordedSteps(golden.recorded, ids)));
    runs.push({ name, golden, run });

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);

    // The exam the teacher reviews is the answer: one DRAFT AI_GENERATED exam with as many questions as asked.
    const exam = await t.prisma.exam.findUniqueOrThrow({
      where: { generationRequestId: run.requestId },
      select: { status: true, origin: true, questionCount: true, _count: { select: { questions: true } } },
    });
    const quantity = golden.expected.request.quantity;
    expect(exam).toEqual({ status: "DRAFT", origin: "AI_GENERATED", questionCount: quantity, _count: { questions: quantity } });

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

  it("018/SC-009 os limiares da tarefa no conjunto inteiro, e toda questão ligada aos tópicos escolhidos", async () => {
    expect(runs).toHaveLength(CASES.length);
    const metrics = examGenerationGateMetrics(runs.map(({ run }) => ({ completed: run.status === "COMPLETED", metrics: run.score.metrics })));
    const quality = EXAM_GENERATION_TASK.quality;
    expect(metrics.schemaValidity).toBeGreaterThanOrEqual(quality.schemaValidity!);
    expect(metrics.configMatch).toBeGreaterThanOrEqual(quality.configMatch!);
    expect(metrics.duplicates).toBeLessThanOrEqual(quality.duplicates!);
    expect(metrics.topicCoverage).toBeGreaterThanOrEqual(quality.topicCoverage!);
    expect(metrics.injectionClean).toBe(1);
    for (const { run } of runs) {
      const topics = await t.prisma.examQuestionTopic.findMany({ where: { question: { exam: { generationRequestId: run.requestId } } }, select: { syllabusItemId: true } });
      expect(topics.length).toBeGreaterThan(0);
      expect(topics.every((topic) => run.ids.topicIds.includes(topic.syllabusItemId))).toBe(true);
    }
  });

  it("018/US7-4 injeção pelo tópico: o pedido registrado vale, nada fora da prova muda e o marcador não chega às questões", async () => {
    const { run } = runs.find(({ golden }) => golden.expected.injection)!;
    expect(run.score.metrics).toMatchObject({ configMatch: 1, forbiddenFound: 0, forbiddenToolsExecuted: 0, injectionClean: 1 });
    const exam = await t.prisma.exam.findUniqueOrThrow({
      where: { generationRequestId: run.requestId },
      select: { status: true, totalGrade: true, questions: { select: { type: true, statement: true } } },
    });
    expect(exam.status).toBe("DRAFT");
    expect(exam.totalGrade.toFixed(2)).toBe("2.00");
    expect(exam.questions).toHaveLength(4);
    expect(exam.questions.every((question) => question.type !== "CODE")).toBe(true);
    expect(exam.questions.some((question) => question.statement.includes("MARCADOR-INJECAO-018"))).toBe(false);
  });
});
