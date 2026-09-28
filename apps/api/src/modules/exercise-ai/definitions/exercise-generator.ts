import { GeneratedExerciseBatchSchema } from "@repo/contracts";
import { z } from "zod";
import { GENERATION_MODEL_FAMILIES } from "../../ai/definitions/model-families";
import { type AiDefinitions, defineAgent, defineTask } from "../../ai/definitions/types";
import { buildExerciseProposal, exerciseItemId } from "../generation/build-proposal";
import { materializeExerciseBatch } from "../generation/materialize";
import { EXERCISE_GENERATION_BATCH } from "../generation/request-content";
import { exerciseBatchOwnership } from "./batch.ownership";
import { EXERCISE_GENERATION_V1 } from "./exercise-generation.prompt";
import { readExerciseGenerationRequestTool } from "./read-exercise-generation-request.tool";

export const EXERCISE_GENERATOR_KEY = "exercise-generator";
export const EXERCISE_GENERATION_PROPOSAL_TYPE = "EXERCISE_GENERATION";

/**
 * The task of the generator (010 research X7, contracts/exercise-generator.md): the 009 policy picks
 * the model — the cheapest approved one of BASIC, a same-tier fallback, one step up to STANDARD
 * after an invalid output. The exercises' difficulty is a field of the request, never of the task.
 */
export const EXERCISE_GENERATION_TASK = defineTask({
  key: "exercise-generation",
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  maxTier: "STANDARD",
  allowedFamilies: [...GENERATION_MODEL_FAMILIES],
  requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER",
  escalation: "ON_OUTPUT_INVALID",
  quality: { schemaValidity: 1, configMatch: 1, duplicates: 0, topicCoverage: 0.9, injectionClean: 1 },
  typicalUsage: { inputTokens: 4_000, outputTokens: 6_000 },
  maxOutputTokens: 16_000,
  timeoutMs: 90_000,
});

/**
 * `exercise-generator` v1 (contracts/exercise-generator.md): an L2 agent whose proposal becomes the
 * batch's DRAFT exercises in the same transaction (`materialize`); approved only through the bank
 * (the 006 decision route refuses APPROVE). DISABLED until the admin enables it after the gate.
 */
export const EXERCISE_GENERATOR = defineAgent({
  key: EXERCISE_GENERATOR_KEY,
  version: 1,
  initialStatus: "DISABLED",
  name: "Gerador de exercícios",
  description: "Prepara rascunhos de exercícios a partir de um tópico da ementa, para o professor revisar e aprovar.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ia.exercicios.gerar",
  prompt: { key: "exercise-generation", version: 1, status: "ACTIVE", systemInstructions: EXERCISE_GENERATION_V1 },
  output: { version: 1, schema: GeneratedExerciseBatchSchema },
  input: z.strictObject({}),
  taskKey: EXERCISE_GENERATION_TASK.key,
  toolKeys: [readExerciseGenerationRequestTool.key],
  resourceTypes: [EXERCISE_GENERATION_BATCH],
  onToolDenied: "fail",
  limits: { maxModelCalls: 3, maxToolCalls: 2 },
  buildContext: (context) => ({ batchId: context.resource?.id }),
  proposal: {
    type: EXERCISE_GENERATION_PROPOSAL_TYPE,
    approveThroughDomain: true,
    // Unused while `build` exists; kept for the hook-less path of the foundation.
    itemIds: (output) => GeneratedExerciseBatchSchema.parse(output).exercises.map((_, index) => exerciseItemId(index)),
    build: buildExerciseProposal,
    materialize: materializeExerciseBatch,
  },
});

/** Everything 010 registers in the AI foundation; the catalog and the provider come from `productionAiDefinitions`. */
export function exerciseAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [EXERCISE_GENERATOR],
    tools: [readExerciseGenerationRequestTool],
    tasks: [EXERCISE_GENERATION_TASK],
    resources: { [EXERCISE_GENERATION_BATCH]: exerciseBatchOwnership },
  };
}
