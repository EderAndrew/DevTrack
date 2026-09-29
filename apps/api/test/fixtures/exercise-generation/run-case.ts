import { randomUUID } from "node:crypto";
import { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { drain } from "../../helpers/ai";
import { requestBatch } from "../../helpers/exercise-ai";
import { createConfirmedTopic, createExercise } from "../../helpers/exercises";
import { createUser, loginAs } from "../../helpers/factories";
import type { TestApp } from "../../helpers/test-app";
import type { GenerationCase } from "./load-golden";
import { type GenerationScore, scoreGenerationCase } from "./score";

/** An exercise of another teacher: its statement must never reach the answer. */
export const FOREIGN_MARKER = "MARCADOR-OUTRO-PROFESSOR-010";

export interface GenerationRun {
  score: GenerationScore;
  executionId: string;
  batchId: string;
  status: string;
  errorCode: string | null;
  /** From the teacher's request to the batch's drafts, in ms (010/SC-002). */
  latencyMs: number;
}

/** Everything a generation could change besides adding the batch's own drafts. */
async function areaSnapshot(t: TestApp, batchId: string): Promise<string> {
  const rows = await Promise.all([
    t.prisma.exerciseGenerationBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: {
        teacherId: true,
        syllabusItemId: true,
        difficulty: true,
        requestedQuantity: true,
        openAnswerQuantity: true,
        multipleChoiceQuantity: true,
        codeQuantity: true,
        trickQuestionQuantity: true,
        languageId: true,
        approvedCount: true,
      },
    }),
    t.prisma.exercise.findMany({
      where: { OR: [{ generationBatchId: { not: batchId } }, { generationBatchId: null }] },
      orderBy: { id: "asc" },
      select: { id: true, teacherId: true, status: true, statement: true, version: true },
    }),
    t.prisma.exercise.count({ where: { status: { not: "DRAFT" }, generationBatchId: batchId } }),
    t.prisma.syllabusItem.findMany({ orderBy: { id: "asc" }, select: { id: true, text: true } }),
    t.prisma.userRole.findMany({ orderBy: { id: "asc" }, select: { userId: true, roleId: true, status: true } }),
  ]);
  return JSON.stringify(rows);
}

/**
 * Runs one golden case of the generator (010 research X16) through the real flow: a teacher with
 * the case's confirmed syllabus asks for the batch, the worker runs it on whatever provider `t`
 * has (`prepare` scripts the fake one with the batch id), and the proposal is scored and stored by
 * `AiEvaluationStore`, tied to the versions of the execution.
 */
export async function runGenerationCase(
  t: TestApp,
  golden: GenerationCase,
  caseId: string,
  prepare: (batchId: string) => void = () => {},
): Promise<GenerationRun> {
  const { syllabus, request } = golden.expected;
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const other = await createUser(t, { roles: ["TEACHER"] });
  await createExercise(t, other.id, { type: "OPEN_ANSWER", statement: `${FOREIGN_MARKER} ${golden.name}` });
  const topic = await createConfirmedTopic(t, teacher.id, {
    title: syllabus.title,
    competencyText: syllabus.competencyText,
    languageKey: syllabus.languageKey,
    groupTitle: syllabus.groupTitle,
    items: syllabus.items,
  });
  const cookie = await loginAs(t, teacher);

  const started = performance.now();
  const res = await requestBatch(t, cookie, {
    ...request,
    syllabusRevisionId: topic.revision.id,
    syllabusItemId: topic.itemId,
    idempotencyKey: randomUUID(),
  });
  if (res.status !== 202) throw new Error(`${golden.name}: request answered ${res.status} ${res.body?.code}`);
  const batchId: string = res.body.id;
  prepare(batchId);
  const before = await areaSnapshot(t, batchId);
  await drain(t);
  const latencyMs = Math.round(performance.now() - started);

  const batch = await t.prisma.exerciseGenerationBatch.findUniqueOrThrow({ where: { id: batchId }, select: { aiExecutionId: true } });
  const execution = await t.prisma.aiExecution.findUniqueOrThrow({
    where: { id: batch.aiExecutionId! },
    include: { proposal: true, toolCallRows: { orderBy: { sequence: "asc" } } },
  });
  const expected = { ...golden.expected, forbiddenPatterns: [...golden.expected.forbiddenPatterns, FOREIGN_MARKER] };
  const score = scoreGenerationCase(expected, execution.proposal?.payload ?? null, {
    toolCalls: execution.toolCallRows.map((call) => ({ toolKey: call.toolKey, status: call.status })),
    areaChanged: (await areaSnapshot(t, batchId)) !== before,
  });
  await t.get(AiEvaluationStore).recordResult(caseId, {
    agentVersionId: execution.agentVersionId,
    promptVersionId: execution.promptVersionId,
    modelConfigId: execution.modelConfigId,
    passed: score.passed,
    metrics: score.metrics,
  });
  return { score, executionId: execution.id, batchId, status: execution.status, errorCode: execution.errorCode, latencyMs };
}

/** One line per case, for the CI log and the on-demand run. */
export function printGenerationScores(runs: { name: string; run: GenerationRun }[]): void {
  console.table(
    runs.map(({ name, run }) => ({
      caso: name,
      aprovado: run.score.passed ? "sim" : "NÃO",
      execucao: run.errorCode ? `${run.status} ${run.errorCode}` : run.status,
      configuracao: run.score.metrics.configMatch === 1 ? "igual" : "DIFERENTE",
      topico: `${run.score.metrics.coveredExercises}/${run.score.metrics.exercises}`,
      duplicados: run.score.metrics.duplicates,
      injecao: run.score.metrics.injectionClean ? "limpa" : "FALHOU",
      segundos: (run.latencyMs / 1000).toFixed(1),
    })),
  );
}
