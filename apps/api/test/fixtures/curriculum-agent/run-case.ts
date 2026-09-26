import { AiEvaluationStore } from "../../../src/modules/ai/evaluation/ai-evaluation.store";
import { drain } from "../../helpers/ai";
import { requestAnalysis, seedDocumentFile } from "../../helpers/curriculum-ai";
import { createSubject, createUser, loginAs } from "../../helpers/factories";
import type { TestApp } from "../../helpers/test-app";
import type { GoldenCase } from "./load-golden";
import { type CaseScore, scoreCurriculumCase } from "./score";

/** A subject of another teacher, which the injection cases ask for: it must never reach the proposal. */
const FOREIGN_MARKER = "MARCADOR-OUTRO-PROFESSOR-007";

export interface CaseRun {
  score: CaseScore;
  executionId: string;
  documentId: string;
  status: string;
  errorCode: string | null;
}

/** Everything of the domain and of access an injection could change. */
async function areaSnapshot(t: TestApp): Promise<string> {
  const rows = await Promise.all([
    t.prisma.subject.findMany({ orderBy: { id: "asc" }, select: { id: true, teacherId: true, name: true } }),
    t.prisma.syllabusDocument.findMany({ orderBy: { id: "asc" }, select: { id: true, subjectId: true, processingStatus: true } }),
    t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true } }),
    t.prisma.userRole.findMany({ orderBy: { id: "asc" }, select: { userId: true, roleId: true, status: true } }),
    t.prisma.rolePermission.count(),
  ]);
  return JSON.stringify(rows);
}

/**
 * Runs one golden case through the real runner (research C17): a teacher asks for the analysis of
 * the case's document, the worker runs it on whatever provider `t` has (`prepare` scripts the fake
 * one), and the proposal is scored and stored by `AiEvaluationStore`, tied to the versions of the
 * execution.
 */
export async function runGoldenCase(
  t: TestApp,
  golden: GoldenCase,
  caseId: string,
  prepare: (documentId: string) => void = () => {},
): Promise<CaseRun> {
  const teacher = await createUser(t, { roles: ["TEACHER"] });
  const other = await createUser(t, { roles: ["TEACHER"] });
  await createSubject(t, other.id, { name: `${FOREIGN_MARKER} ${golden.name}` });
  const { document } = await seedDocumentFile(t, teacher.id, golden.documentPath);
  prepare(document.id);
  const before = await areaSnapshot(t);

  const res = await requestAnalysis(t, await loginAs(t, teacher), document.id);
  if (res.status !== 202) throw new Error(`${golden.name}: request answered ${res.status} ${res.body?.code}`);
  await drain(t);

  const execution = await t.prisma.aiExecution.findUniqueOrThrow({
    where: { id: res.body.execution.id },
    include: { proposal: true, toolCallRows: { orderBy: { sequence: "asc" } } },
  });
  const score = scoreCurriculumCase(golden.expected, execution.proposal?.payload ?? null, {
    toolCalls: execution.toolCallRows.map((call) => ({ toolKey: call.toolKey, status: call.status })),
    areaChanged: (await areaSnapshot(t)) !== before,
    foreignMarkers: [FOREIGN_MARKER],
  });
  await t.get(AiEvaluationStore).recordResult(caseId, {
    agentVersionId: execution.agentVersionId,
    promptVersionId: execution.promptVersionId,
    modelConfigId: execution.modelConfigId,
    passed: score.passed,
    metrics: score.metrics,
  });
  return { score, executionId: execution.id, documentId: document.id, status: execution.status, errorCode: execution.errorCode };
}

/** One line per case, for the CI log and the on-demand run. */
export function printScores(runs: { name: string; run: CaseRun }[]): void {
  const rows = runs.map(({ name, run }) => ({
    caso: name,
    aprovado: run.score.passed ? "sim" : "NÃO",
    execucao: run.status,
    campos: `${run.score.metrics.fieldHits}/3`,
    recall: `${Math.round(run.score.metrics.itemRecall! * 100)}%`,
    itens: `${run.score.metrics.itemsInOrder}/${run.score.metrics.expectedItems} (+${run.score.metrics.extraItems})`,
    marcados: run.score.metrics.flaggedItems,
    semAviso: run.score.metrics.unsupportedWithoutWarning,
    inventados: run.score.metrics.inventedFields,
    injecao: run.score.metrics.injectionClean ? "limpa" : "FALHOU",
  }));
  console.table(rows);
}
