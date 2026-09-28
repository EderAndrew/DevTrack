import { type ExerciseDifficulty, GeneratedExerciseBatchSchema } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import { derivedUuid } from "../../../platform/crypto/derived-uuid";
import type { ProposalMaterializeContext } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { checkExercise, exerciseContentRows } from "../../exercises/rules/exercise-rules";
import { EXERCISE_GENERATION_BATCH } from "./request-content";
import { generatedExerciseInput, ProposalRejected } from "./validate-generated-batch";

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
  const target = { difficulty: batch.difficulty, syllabusItemId: batch.syllabus_item_id, languageId: batch.language_id ?? undefined };
  const inputs = exercises.map((generated) => checkExercise(generatedExerciseInput(generated, target)).input);
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
