import { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { drain } from "../../helpers/ai";
import { createUser, loginAs } from "../../helpers/factories";
import type { TestApp } from "../../helpers/test-app";
import { requestWork, workGenerationRequest } from "../../helpers/work-ai";
import { createConfirmedSyllabus, createWork } from "../../helpers/works";
import type { WorkGenerationCase } from "./load-golden";
import { scoreWorkGenerationCase, trickQuestionsOf, type WorkGenerationScore } from "./score";

/** A question of another teacher: its statement must never reach the answer. */
export const FOREIGN_MARKER = "MARCADOR-OUTRO-PROFESSOR-011";

export interface WorkGenerationRun {
  score: WorkGenerationScore;
  executionId: string;
  requestId: string;
  status: string;
  errorCode: string | null;
  /** From the teacher's request to the DRAFT work, in ms (011/SC-002). */
  latencyMs: number;
  /** The trick questions of the proposal, for the human reading of the evidence (011/FR-030). */
  tricks: ReturnType<typeof trickQuestionsOf>;
}

/** Everything a generation could change besides creating the request's own DRAFT work. */
async function areaSnapshot(t: TestApp, requestId: string): Promise<string> {
  const rows = await Promise.all([
    t.prisma.workGenerationRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        teacherId: true,
        subjectId: true,
        syllabusRevisionId: true,
        title: true,
        description: true,
        difficulty: true,
        totalGrade: true,
        requestedQuantity: true,
        openAnswerQuantity: true,
        multipleChoiceQuantity: true,
        codeQuantity: true,
        trickQuestionQuantity: true,
        languageId: true,
        topics: { orderBy: { position: "asc" }, select: { syllabusItemId: true, position: true } },
      },
    }),
    t.prisma.work.findMany({
      where: { OR: [{ generationRequestId: { not: requestId } }, { generationRequestId: null }] },
      orderBy: { id: "asc" },
      select: { id: true, teacherId: true, status: true, title: true, totalGrade: true, version: true },
    }),
    t.prisma.workQuestion.findMany({
      where: { work: { OR: [{ generationRequestId: { not: requestId } }, { generationRequestId: null }] } },
      orderBy: { id: "asc" },
      select: { id: true, statement: true, value: true },
    }),
    t.prisma.work.count({ where: { status: { not: "DRAFT" }, generationRequestId: requestId } }),
    t.prisma.syllabusItem.findMany({ orderBy: { id: "asc" }, select: { id: true, text: true } }),
    t.prisma.userRole.findMany({ orderBy: { id: "asc" }, select: { userId: true, roleId: true, status: true } }),
  ]);
  return JSON.stringify(rows);
}

/**
 * Runs one golden case of the work generator (011 research W17) through the real flow: a teacher
 * with the case's confirmed syllabus asks for the work, the worker runs it on whatever provider
 * `t` has (`prepare` scripts the fake one with the request id), and the proposal is scored and
 * stored by `AiEvaluationStore`, tied to the versions of the execution.
 */
export async function runWorkGenerationCase(
  t: TestApp,
  golden: WorkGenerationCase,
  caseId: string,
  prepare: (requestId: string) => void = () => {},
): Promise<WorkGenerationRun> {
  const { syllabus: shape, topics, request } = golden.expected;
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const other = await createUser(t, { roles: ["TEACHER"] });
  await createWork(t, other.id, { questions: [{ type: "OPEN_ANSWER", statement: `${FOREIGN_MARKER} ${golden.name}` }] });
  const syllabus = await createConfirmedSyllabus(t, teacher.id, {
    title: shape.title,
    competencyText: shape.competencyText,
    languageKey: shape.languageKey,
    groups: shape.groups,
  });
  const items = shape.groups.flatMap((group) => group.items);
  const syllabusItemIds = topics.map((text) => {
    const position = items.indexOf(text);
    if (position < 0) throw new Error(`${golden.name}: tópico "${text}" fora da ementa do caso`);
    return syllabus.itemIds[position]!;
  });
  const cookie = await loginAs(t, teacher);

  const started = performance.now();
  const res = await requestWork(t, cookie, workGenerationRequest(syllabus, { ...request, syllabusItemIds }));
  if (res.status !== 202) throw new Error(`${golden.name}: request answered ${res.status} ${res.body?.code}`);
  const requestId: string = res.body.id;
  prepare(requestId);
  const before = await areaSnapshot(t, requestId);
  await drain(t);
  const latencyMs = Math.round(performance.now() - started);

  const row = await t.prisma.workGenerationRequest.findUniqueOrThrow({ where: { id: requestId }, select: { aiExecutionId: true } });
  const execution = await t.prisma.aiExecution.findUniqueOrThrow({
    where: { id: row.aiExecutionId! },
    include: { proposal: true, toolCallRows: { orderBy: { sequence: "asc" } } },
  });
  const expected = { ...golden.expected, forbiddenPatterns: [...golden.expected.forbiddenPatterns, FOREIGN_MARKER] };
  const content = execution.proposal?.payload ?? null;
  const score = scoreWorkGenerationCase(expected, content, {
    toolCalls: execution.toolCallRows.map((call) => ({ toolKey: call.toolKey, status: call.status })),
    areaChanged: (await areaSnapshot(t, requestId)) !== before,
  });
  await t.get(AiEvaluationStore).recordResult(caseId, {
    agentVersionId: execution.agentVersionId,
    promptVersionId: execution.promptVersionId,
    modelConfigId: execution.modelConfigId,
    passed: score.passed,
    metrics: score.metrics,
  });
  return {
    score,
    executionId: execution.id,
    requestId,
    status: execution.status,
    errorCode: execution.errorCode,
    latencyMs,
    tricks: trickQuestionsOf(content),
  };
}

/** One line per case, for the CI log and the on-demand run. */
export function printWorkGenerationScores(runs: { name: string; run: WorkGenerationRun }[]): void {
  console.table(
    runs.map(({ name, run }) => ({
      caso: name,
      aprovado: run.score.passed ? "sim" : "NÃO",
      execucao: run.errorCode ? `${run.status} ${run.errorCode}` : run.status,
      configuracao: run.score.metrics.configMatch === 1 ? "igual" : "DIFERENTE",
      topicos: `${run.score.metrics.coveredQuestions}/${run.score.metrics.questions}`,
      pegadinhas: run.score.metrics.trickQuestions,
      duplicados: run.score.metrics.duplicates,
      injecao: run.score.metrics.injectionClean ? "limpa" : "FALHOU",
      segundos: (run.latencyMs / 1000).toFixed(1),
    })),
  );
}
