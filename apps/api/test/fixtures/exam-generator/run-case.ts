import { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { drain } from "../../helpers/ai";
import { examGenerationRequest, requestExamGeneration } from "../../helpers/exam-ai";
import { createExam } from "../../helpers/exams";
import { createUser, loginAs } from "../../helpers/factories";
import { api, type TestApp } from "../../helpers/test-app";
import { createConfirmedSyllabus } from "../../helpers/works";
import type { ExamGenerationCase, RunIds } from "./load-golden";
import { type ExamGenerationScore, scoreExamGenerationCase } from "./score";

/** A question of another teacher's exam: its statement must never reach the answer. */
export const FOREIGN_MARKER = "MARCADOR-OUTRO-PROFESSOR-018";

export interface ExamGenerationRun {
  score: ExamGenerationScore;
  executionId: string;
  requestId: string;
  ids: RunIds;
  status: string;
  errorCode: string | null;
  /** From the teacher's request to the DRAFT exam, in ms. */
  latencyMs: number;
}

/** Everything a generation could change besides creating the request's own DRAFT exam. */
async function areaSnapshot(t: TestApp, requestId: string): Promise<string> {
  const others = { OR: [{ generationRequestId: { not: requestId } }, { generationRequestId: null }] };
  const rows = await Promise.all([
    t.prisma.examGenerationRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        teacherId: true,
        subjectId: true,
        syllabusRevisionId: true,
        title: true,
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
    t.prisma.exam.findMany({ where: others, orderBy: { id: "asc" }, select: { id: true, teacherId: true, status: true, title: true, totalGrade: true, version: true } }),
    t.prisma.examQuestion.findMany({ where: { exam: others }, orderBy: { id: "asc" }, select: { id: true, statement: true, value: true } }),
    t.prisma.exam.count({ where: { status: { not: "DRAFT" }, generationRequestId: requestId } }),
    t.prisma.syllabusItem.findMany({ orderBy: { id: "asc" }, select: { id: true, text: true } }),
    t.prisma.userRole.findMany({ orderBy: { id: "asc" }, select: { userId: true, roleId: true, status: true } }),
  ]);
  return JSON.stringify(rows);
}

/**
 * Runs one golden case of the exam generator (018 research T14) through the real flow: a teacher with
 * the case's confirmed syllabus asks for the exam, the worker runs it on whatever provider `t` has
 * (`prepare` scripts the fake one with the run's ids), and the proposal is scored and stored by
 * `AiEvaluationStore`, tied to the versions of the execution.
 */
export async function runExamGenerationCase(
  t: TestApp,
  golden: ExamGenerationCase,
  caseId: string,
  prepare: (ids: RunIds) => void = () => {},
): Promise<ExamGenerationRun> {
  const { syllabus: shape, topics, request } = golden.expected;
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const other = await createUser(t, { roles: ["TEACHER"] });
  await createExam(t, other.id, { questions: [{ type: "OPEN_ANSWER", statement: `${FOREIGN_MARKER} ${golden.name}` }] });
  const syllabus = await createConfirmedSyllabus(t, teacher.id, {
    title: shape.title,
    competencyText: shape.competencyText,
    languageKey: shape.languageKey,
    groups: shape.groups,
  });
  const items = shape.groups.flatMap((group) => group.items);
  const topicIds = topics.map((text) => {
    const position = items.indexOf(text);
    if (position < 0) throw new Error(`${golden.name}: tópico "${text}" fora da ementa do caso`);
    return syllabus.itemIds[position]!;
  });
  const client = api(t, { cookie: await loginAs(t, teacher) });

  const started = performance.now();
  const res = await requestExamGeneration(client, examGenerationRequest(syllabus, { ...request, topicIds }));
  if (res.status !== 202) throw new Error(`${golden.name}: request answered ${res.status} ${res.body?.code}`);
  const requestId: string = res.body.id;
  const languageId = request.distribution.CODE > 0 ? syllabus.languageId : null;
  const ids: RunIds = { requestId, topicIds, languageId };
  prepare(ids);
  const before = await areaSnapshot(t, requestId);
  await drain(t);
  const latencyMs = Math.round(performance.now() - started);

  const row = await t.prisma.examGenerationRequest.findUniqueOrThrow({ where: { id: requestId }, select: { aiExecutionId: true } });
  const execution = await t.prisma.aiExecution.findUniqueOrThrow({
    where: { id: row.aiExecutionId! },
    include: { proposal: true, toolCallRows: { orderBy: { sequence: "asc" } } },
  });
  const expected = { ...golden.expected, forbiddenPatterns: [...golden.expected.forbiddenPatterns, FOREIGN_MARKER] };
  const score = scoreExamGenerationCase(expected, execution.proposal?.payload ?? null, {
    topicIds,
    languageId,
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
  return { score, executionId: execution.id, requestId, ids, status: execution.status, errorCode: execution.errorCode, latencyMs };
}

/** One line per case, for the CI log and the on-demand run. */
export function printExamGenerationScores(runs: { name: string; run: ExamGenerationRun }[]): void {
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
