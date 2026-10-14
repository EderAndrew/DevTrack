import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { defineTool, ToolRefusal } from "../../ai/definitions/types";
import { EXAM_GENERATION_REQUEST, ExamGenerationRequestContentSchema, READ_EXAM_GENERATION_REQUEST } from "../generation/request-content";

/**
 * `read-exam-generation-request` (018 contracts/exam-generator.md, L1): the chosen topics and the
 * configuration of the one request the execution was made for. The 006 executor has already checked
 * the allowlist, the permission, the strict input and that the request is the workspace's; `run` also
 * requires it to be this execution's, and returns only what the generation needs — no exam title or
 * grade, subject name, user, class or student.
 */
export const readExamGenerationRequestTool = defineTool({
  key: READ_EXAM_GENERATION_REQUEST,
  name: "Ler pedido de geração de prova",
  description: "Lê os tópicos da ementa e a configuração do pedido de prova desta geração. Recebe apenas o requestId informado no contexto.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 5_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.provas.gerar",
  resourceType: EXAM_GENERATION_REQUEST,
  inputSchema: z.strictObject({ requestId: UuidSchema }),
  outputSchema: ExamGenerationRequestContentSchema,
  resourceIdOf: (input) => input.requestId,
  async run(context, input) {
    // Only the request of this execution, whatever the model asked for.
    const request = await context.db.examGenerationRequest.findFirst({
      where: { id: input.requestId, teacherId: context.workspaceId, aiExecutionId: context.executionId },
      select: {
        difficulty: true,
        requestedQuantity: true,
        openAnswerQuantity: true,
        multipleChoiceQuantity: true,
        codeQuantity: true,
        trickQuestionQuantity: true,
        language: { select: { id: true, name: true } },
        syllabusRevision: { select: { title: true, competencyText: true } },
        topics: {
          select: { syllabusItem: { select: { id: true, text: true, group: { select: { title: true } } } } },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!request) throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    return {
      syllabus: { title: request.syllabusRevision.title, competency: request.syllabusRevision.competencyText },
      topics: request.topics.map(({ syllabusItem }) => ({ id: syllabusItem.id, itemText: syllabusItem.text, groupTitle: syllabusItem.group.title })),
      request: {
        difficulty: request.difficulty,
        quantity: request.requestedQuantity,
        counts: { OPEN_ANSWER: request.openAnswerQuantity, MULTIPLE_CHOICE: request.multipleChoiceQuantity, CODE: request.codeQuantity },
        trickCount: request.trickQuestionQuantity,
        language: request.codeQuantity > 0 && request.language ? { id: request.language.id, name: request.language.name } : null,
      },
    };
  },
});
