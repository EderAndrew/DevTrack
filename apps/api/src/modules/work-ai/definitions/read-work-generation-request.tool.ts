import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { defineTool, ToolRefusal } from "../../ai/definitions/types";
import {
  READ_WORK_GENERATION_REQUEST,
  topicRef,
  WORK_GENERATION_REQUEST,
  WorkGenerationRequestContentSchema,
} from "../generation/request-content";

/**
 * `read-work-generation-request` (011 contracts/work-generator.md, research W12): the topics and
 * the configuration of the one request the execution was made for. The 006 executor has already
 * checked the allowlist, the permission, the strict input and that the request is the
 * workspace's; `run` also requires it to be this execution's, and returns only what the generation
 * needs — topics by ref, no id, and none of the work's title, description or grade (FR-025).
 */
export const readWorkGenerationRequestTool = defineTool({
  key: READ_WORK_GENERATION_REQUEST,
  name: "Ler pedido de geração de trabalho",
  description: "Lê os tópicos da ementa e a configuração do pedido de trabalho desta geração. Recebe apenas o requestId informado no contexto.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 5_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.trabalhos.gerar",
  resourceType: WORK_GENERATION_REQUEST,
  inputSchema: z.strictObject({ requestId: UuidSchema }),
  outputSchema: WorkGenerationRequestContentSchema,
  resourceIdOf: (input) => input.requestId,
  async run(context, input) {
    // Only the request of this execution, whatever the model asked for (FR-026).
    const request = await context.db.workGenerationRequest.findFirst({
      where: { id: input.requestId, teacherId: context.workspaceId, aiExecutionId: context.executionId },
      select: {
        difficulty: true,
        requestedQuantity: true,
        openAnswerQuantity: true,
        multipleChoiceQuantity: true,
        codeQuantity: true,
        trickQuestionQuantity: true,
        language: { select: { name: true } },
        syllabusRevision: { select: { title: true, competencyText: true, language: { select: { name: true } } } },
        topics: {
          select: { position: true, syllabusItem: { select: { text: true, group: { select: { title: true } } } } },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!request) throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    return {
      syllabus: {
        title: request.syllabusRevision.title,
        competency: request.syllabusRevision.competencyText,
        language: request.syllabusRevision.language?.name ?? null,
      },
      topics: request.topics.map((topic) => ({
        ref: topicRef(topic.position),
        itemText: topic.syllabusItem.text,
        groupTitle: topic.syllabusItem.group.title,
      })),
      request: {
        difficulty: request.difficulty,
        total: request.requestedQuantity,
        counts: { OPEN_ANSWER: request.openAnswerQuantity, MULTIPLE_CHOICE: request.multipleChoiceQuantity, CODE: request.codeQuantity },
        trickQuestions: request.trickQuestionQuantity,
        language: request.codeQuantity > 0 ? (request.language?.name ?? null) : null,
      },
    };
  },
});
