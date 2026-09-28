import { type ExerciseDifficulty, type GeneratedExercise, GeneratedExerciseBatchSchema } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import { derivedUuid } from "../../../platform/crypto/derived-uuid";
import type { ProposalMaterializeContext } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { checkExercise, exerciseContentRows } from "../../exercises/rules/exercise-rules";
import { ProposalRejected } from "./build-proposal";
import { EXERCISE_GENERATION_BATCH } from "./request-content";

interface LockedBatch {
  id: string;
  teacher_id: string;
  syllabus_item_id: string;
  difficulty: ExerciseDifficulty;
  language_id: string | null;
  ai_execution_id: string | null;
  generated_at: Date | null;
}

/**
 * The exercise input of a generated one (research X8): topic and difficulty from the batch, and
 * the language as the batch's — the output never chooses them (FR-031). The structural rules of
 * manual input apply as they are (FR-006).
 */
function toInput(generated: GeneratedExercise, batch: LockedBatch): unknown {
  const common = {
    statement: generated.statement,
    explanation: generated.explanation,
    difficulty: batch.difficulty,
    cognitiveObjective: generated.cognitiveObjective,
    syllabusItemId: batch.syllabus_item_id,
  };
  if (generated.type === "OPEN_ANSWER") return { type: generated.type, ...common, expectedAnswer: generated.expectedAnswer };
  if (generated.type === "MULTIPLE_CHOICE") {
    return { type: generated.type, ...common, alternatives: generated.alternatives, isTrickQuestion: generated.isTrickQuestion };
  }
  return {
    type: generated.type,
    ...common,
    instructions: generated.instructions,
    ...(generated.starterCode === null ? {} : { starterCode: generated.starterCode }),
    expectedSolution: generated.expectedSolution,
    languageId: batch.language_id ?? undefined,
  };
}

/**
 * `proposal.materialize` of `exercise-generator` (010 research X8): in the transaction that
 * completes the execution, the batch (locked) gets its DRAFT `AI_GENERATED` exercises and their
 * alternatives, `generated_at`, and `exercise_batch.generated`. Anything wrong throws, and the
 * runner rolls it all back: a batch has all its exercises or none (FR-032).
 */
export async function materializeExerciseBatch(tx: Tx, context: ProposalMaterializeContext): Promise<void> {
  if (context.resource?.type !== EXERCISE_GENERATION_BATCH) throw new ProposalRejected("BATCH_MISMATCH");
  const [batch] = await tx.$queryRaw<LockedBatch[]>`
    SELECT id, teacher_id, syllabus_item_id, difficulty::text AS difficulty, language_id, ai_execution_id, generated_at
    FROM exercise_generation_batches
    WHERE id = ${context.resource.id}::uuid AND teacher_id = ${context.workspaceId}::uuid
    FOR UPDATE`;
  if (!batch || batch.ai_execution_id !== context.executionId || batch.generated_at !== null) throw new ProposalRejected("BATCH_MISMATCH");

  const { exercises } = GeneratedExerciseBatchSchema.parse(context.content);
  const inputs = exercises.map((generated) => checkExercise(toInput(generated, batch)).input);
  if (inputs.some((input) => input === null)) throw new ProposalRejected("STRUCTURE_INVALID");

  for (const [index, input] of inputs.entries()) {
    const rows = exerciseContentRows(input!);
    await tx.exercise.create({
      data: {
        teacherId: batch.teacher_id,
        type: input!.type,
        difficulty: batch.difficulty,
        cognitiveObjective: input!.cognitiveObjective,
        origin: "AI_GENERATED",
        status: "DRAFT",
        statement: rows.statement,
        statementSearchKey: rows.statementSearchKey,
        explanation: rows.explanation,
        ...rows.columns,
        syllabusItemId: batch.syllabus_item_id,
        generationBatchId: batch.id,
        // Stable per execution and position: the proposal's item and the exercise stay linked.
        generationItemId: derivedUuid(`${context.executionId}:${context.itemIds[index]}`),
        alternatives: { create: rows.alternatives },
      },
      select: { id: true },
    });
  }
  await tx.exerciseGenerationBatch.update({ where: { id: batch.id }, data: { generatedAt: context.now } });
  await context.get(AuditService).record(tx, {
    type: "exercise_batch.generated",
    actorType: "SYSTEM",
    targetType: "EXERCISE_BATCH",
    targetId: batch.id,
    metadata: { executionId: context.executionId, exercises: inputs.length },
  });
}
