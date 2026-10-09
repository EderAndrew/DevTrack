import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { defineTool, ToolRefusal } from "../../ai/definitions/types";
import { ALTERNATIVE_LABELS, READ_WORK_HELP_REQUEST, WORK_HELP_REQUEST, type WorkHelpRequestContent, WorkHelpRequestContentSchema } from "./request-content";

/**
 * `read-work-help-request` (015 contracts/work-helper.md, research F8): the one request the execution
 * was made for. The 006 executor has already checked the allowlist, the permission, the strict input
 * and that the request is the workspace's (the student's); `run` also requires it to be this
 * execution's. It selects only what the student's view of the question shows (the allowlist of
 * `activities/views/student-view.ts`: statement, instructions, starter code, language name, the
 * alternatives' texts in order and the PUBLIC test cases) — the answer key is never read here — plus
 * the student's saved answer, their question and the orientations already delivered for the question.
 */
export const readWorkHelpRequestTool = defineTool({
  key: READ_WORK_HELP_REQUEST,
  name: "Ler pedido de ajuda",
  description: "Lê a questão do trabalho, a resposta salva do aluno e a pergunta dele. Recebe apenas o requestId informado no contexto.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 5_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.ajuda.pedir",
  resourceType: WORK_HELP_REQUEST,
  inputSchema: z.strictObject({ requestId: UuidSchema }),
  outputSchema: WorkHelpRequestContentSchema,
  resourceIdOf: (input) => input.requestId,
  async run(context, input): Promise<WorkHelpRequestContent> {
    // Only the request of this execution, whatever the model asked for.
    const request = await context.db.workHelpRequest.findFirst({
      where: { id: input.requestId, studentUserId: context.workspaceId, aiExecutionId: context.executionId },
      select: {
        id: true,
        attemptId: true,
        questionId: true,
        question: true,
        requestedAt: true,
        questionRef: {
          select: {
            type: true,
            statement: true,
            instructions: true,
            starterCode: true,
            language: { select: { name: true } },
            alternatives: { orderBy: { position: "asc" }, select: { id: true, text: true } },
            testCases: { where: { visibility: "PUBLIC" }, orderBy: { position: "asc" }, select: { input: true, expectedOutput: true } },
          },
        },
      },
    });
    if (!request) throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    const question = request.questionRef;
    const answer = await context.db.activityAnswer.findFirst({
      where: { attemptId: request.attemptId, questionId: request.questionId },
      select: { text: true, source: true, alternativeId: true },
    });
    const previous = await context.db.workHelpRequest.findMany({
      where: { attemptId: request.attemptId, questionId: request.questionId, status: "DELIVERED", requestedAt: { lt: request.requestedAt } },
      orderBy: { requestedAt: "asc" },
      select: { message: true },
    });
    const labelOf = new Map(question.alternatives.map((alternative, index) => [alternative.id, ALTERNATIVE_LABELS[index]!]));
    const choice = question.type === "MULTIPLE_CHOICE" && answer?.alternativeId ? labelOf.get(answer.alternativeId) : undefined;
    const written = question.type === "CODE" ? answer?.source : question.type === "OPEN_ANSWER" ? answer?.text : null;
    return {
      questionType: question.type,
      statement: question.statement,
      instructions: question.instructions,
      starterCode: question.starterCode,
      language: question.language?.name ?? null,
      alternatives:
        question.type === "MULTIPLE_CHOICE" ? question.alternatives.map((alternative, index) => ({ label: ALTERNATIVE_LABELS[index]!, text: alternative.text })) : null,
      publicTestCases: question.type === "CODE" ? question.testCases : null,
      studentAnswer: choice ? { label: choice } : written && written.trim().length > 0 ? written : null,
      studentQuestion: request.question,
      previousGuidance: previous.flatMap((row) => (row.message ? [row.message] : [])),
    };
  },
});
