import type { Answer } from "@repo/contracts";
import { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { createActivity, createClassWithStudents, saveAnswers, startAttempt } from "../../helpers/activities";
import { drain } from "../../helpers/ai";
import { createUser, loginAs } from "../../helpers/factories";
import { api, type TestApp } from "../../helpers/test-app";
import { requestHelp } from "../../helpers/work-help";
import type { WorkHelpCase } from "./load-golden";
import { scoreWorkHelpCase, type WorkHelpScore } from "./score";

const DAY = 86_400_000;

export interface WorkHelpRun {
  score: WorkHelpScore;
  executionId: string;
  requestId: string;
  /** The execution's status and error code. */
  status: string;
  errorCode: string | null;
  /** The request's final status (DELIVERED, OUT_OF_SCOPE, BLOCKED, FAILED). */
  helpStatus: string;
  /** The model's output, for the human reading of the evidence. */
  output: unknown;
  /** From the student's request to the settled request, in ms (015/SC-007). */
  latencyMs: number;
}

/**
 * Runs one golden case of the AI help (015 research F16) through the real flow: a student of a class
 * with a work that has the case's question and the help on starts, saves the case's answer and asks;
 * the worker runs it on whatever provider `t` has (`prepare` scripts the fake one with the request
 * id), and the model's output is scored and stored by `AiEvaluationStore`, tied to the versions of
 * the execution.
 */
export async function runWorkHelpCase(t: TestApp, golden: WorkHelpCase, caseId: string, prepare: (requestId: string) => void = () => {}): Promise<WorkHelpRun> {
  const { question } = golden.input;
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { students: 1 });
  const client = api(t, { cookie: await loginAs(t, students[0]!) });
  const activity = await createActivity(t, schoolClass, {
    publishAt: new Date(Date.now() - DAY),
    deadline: new Date(Date.now() + 7 * DAY),
    aiHelpAllowance: 3,
    questions: [
      {
        type: question.type,
        statement: question.statement,
        instructions: question.instructions ?? null,
        starterCode: question.starterCode ?? null,
        languageKey: question.languageKey,
        alternatives: question.alternatives,
        correctIndex: question.correctIndex,
        expectedAnswer: question.expectedAnswer,
        expectedSolution: question.expectedSolution,
        explanation: question.explanation ?? null,
        testCases: question.testCases,
      },
    ],
  });
  const activityId = activity.activity.id;
  const questionId = activity.questionIds[0]!;
  const started = await startAttempt(client, activityId);
  if (started.status !== 200) throw new Error(`${golden.name}: start answered ${started.status} ${started.body?.code}`);
  const answer = answerOf(golden, activity.alternativeIds[0] ?? []);
  if (answer) {
    const saved = await saveAnswers(client, activityId, [{ questionId, answer, baseRevision: 0 }]);
    if (saved.status !== 200) throw new Error(`${golden.name}: save answered ${saved.status} ${saved.body?.code}`);
  }

  const asked = performance.now();
  const res = await requestHelp(client, activityId, { questionId, question: golden.input.studentQuestion });
  if (res.status !== 202) throw new Error(`${golden.name}: request answered ${res.status} ${res.body?.code}`);
  const requestId: string = res.body.id;
  prepare(requestId);
  await drain(t);
  const latencyMs = Math.round(performance.now() - asked);

  const row = await t.prisma.workHelpRequest.findUniqueOrThrow({ where: { id: requestId }, select: { aiExecutionId: true, status: true } });
  const execution = await t.prisma.aiExecution.findUniqueOrThrow({
    where: { id: row.aiExecutionId! },
    include: { proposal: true, toolCallRows: { orderBy: { sequence: "asc" } } },
  });
  const content = execution.proposal?.payload ?? null;
  const score = scoreWorkHelpCase(golden.input, golden.expected, content, {
    toolCalls: execution.toolCallRows.map((call) => ({ toolKey: call.toolKey, status: call.status })),
    status: row.status,
  });
  await t.get(AiEvaluationStore).recordResult(caseId, {
    agentVersionId: execution.agentVersionId,
    promptVersionId: execution.promptVersionId,
    modelConfigId: execution.modelConfigId,
    passed: score.passed,
    metrics: score.metrics,
  });
  return { score, executionId: execution.id, requestId, status: execution.status, errorCode: execution.errorCode, helpStatus: row.status, output: content, latencyMs };
}

function answerOf(golden: WorkHelpCase, alternativeIds: readonly string[]): Answer | null {
  const saved = golden.input.studentAnswer;
  if (!saved) return null;
  if ("alternativeIndex" in saved) return { kind: "ALTERNATIVE", alternativeId: alternativeIds[saved.alternativeIndex]! };
  if ("source" in saved) return { kind: "CODE", source: saved.source };
  return { kind: "TEXT", text: saved.text };
}

/** One line per case, for the CI log and the on-demand run. */
export function printWorkHelpScores(runs: { name: string; run: WorkHelpRun }[]): void {
  console.table(
    runs.map(({ name, run }) => ({
      caso: name,
      aprovado: run.score.passed ? "sim" : "NÃO",
      execucao: run.errorCode ? `${run.status} ${run.errorCode}` : run.status,
      ajuda: run.helpStatus,
      vazou: run.score.metrics.leaked ? "SIM" : "não",
      escopo: run.score.metrics.scopeCorrect ? "certo" : "ERRADO",
      pertinente: run.score.metrics.relevanceCounted ? (run.score.metrics.relevant ? "sim" : "NÃO") : "—",
      segundos: (run.latencyMs / 1000).toFixed(1),
    })),
  );
}

/** The 95th percentile of the latencies, in ms (015/SC-007: ≤ 15 s). */
export function p95(latencies: readonly number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)]!;
}
