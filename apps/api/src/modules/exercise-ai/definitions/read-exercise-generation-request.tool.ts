import { UuidSchema } from "@repo/contracts";
import { z } from "zod";
import { defineTool, ToolRefusal } from "../../ai/definitions/types";
import {
  EXERCISE_GENERATION_BATCH,
  ExerciseGenerationRequestContentSchema,
  READ_EXERCISE_GENERATION_REQUEST,
} from "../generation/request-content";

/**
 * `read-exercise-generation-request` (010 contracts/exercise-generator.md, research X11): the topic
 * and the configuration of the one batch the execution was requested for. The 006 executor has
 * already checked the allowlist, the permission, the strict input and that the batch is the
 * workspace's; `run` also requires the batch to be this execution's, and returns only what the
 * generation needs.
 */
export const readExerciseGenerationRequestTool = defineTool({
  key: READ_EXERCISE_GENERATION_REQUEST,
  name: "Ler pedido de geração de exercícios",
  description: "Lê o tópico da ementa e a configuração do lote de exercícios desta geração. Recebe apenas o batchId informado no contexto.",
  riskLevel: "L1_READ_ONLY",
  timeoutMs: 5_000,
  initialStatus: "ENABLED",
  requiredPermission: "ia.exercicios.gerar",
  resourceType: EXERCISE_GENERATION_BATCH,
  inputSchema: z.strictObject({ batchId: UuidSchema }),
  outputSchema: ExerciseGenerationRequestContentSchema,
  resourceIdOf: (input) => input.batchId,
  async run(context, input) {
    // Only the batch of this execution, whatever the model asked for (FR-026).
    const batch = await context.db.exerciseGenerationBatch.findFirst({
      where: { id: input.batchId, teacherId: context.workspaceId, aiExecutionId: context.executionId },
      select: {
        difficulty: true,
        requestedQuantity: true,
        openAnswerQuantity: true,
        multipleChoiceQuantity: true,
        codeQuantity: true,
        trickQuestionQuantity: true,
        language: { select: { name: true } },
        syllabusItem: { select: { text: true, group: { select: { title: true } } } },
        syllabusRevision: { select: { title: true, competencyText: true } },
      },
    });
    if (!batch) throw new ToolRefusal("AI_CONTEXT_ACCESS_DENIED");
    return {
      topic: {
        itemText: batch.syllabusItem.text,
        groupTitle: batch.syllabusItem.group.title,
        syllabusTitle: batch.syllabusRevision.title,
        competency: batch.syllabusRevision.competencyText,
      },
      request: {
        difficulty: batch.difficulty,
        total: batch.requestedQuantity,
        counts: { OPEN_ANSWER: batch.openAnswerQuantity, MULTIPLE_CHOICE: batch.multipleChoiceQuantity, CODE: batch.codeQuantity },
        trickQuestions: batch.trickQuestionQuantity,
        language: batch.codeQuantity > 0 ? (batch.language?.name ?? null) : null,
      },
    };
  },
});
