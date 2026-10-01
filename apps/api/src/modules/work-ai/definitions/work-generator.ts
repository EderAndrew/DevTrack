import { GeneratedWorkSchema } from "@repo/contracts";
import { z } from "zod";
import { GENERATION_MODEL_FAMILIES } from "../../ai/definitions/model-families";
import { type AiDefinitions, defineAgent, defineTask } from "../../ai/definitions/types";
import { buildWorkProposal, workQuestionItemId } from "../generation/build-proposal";
import { materializeGeneratedWork } from "../generation/materialize";
import { WORK_GENERATION_REQUEST } from "../generation/request-content";
import { readWorkGenerationRequestTool } from "./read-work-generation-request.tool";
import { workGenerationRequestOwnership } from "./request.ownership";
import { WORK_GENERATION_V1 } from "./work-generation.prompt";

export const WORK_GENERATOR_KEY = "work-generator";
export const WORK_GENERATION_PROPOSAL_TYPE = "WORK_GENERATION";

/**
 * The task of the generator (011 research W9, contracts/work-generator.md): the 009 policy picks
 * the model — the cheapest approved one of BASIC, a same-tier fallback, one step up to STANDARD
 * after an invalid output. The work's difficulty is a field of the request, never of the task.
 */
export const WORK_GENERATION_TASK = defineTask({
  key: "work-generation",
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  maxTier: "STANDARD",
  allowedFamilies: [...GENERATION_MODEL_FAMILIES],
  requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER",
  escalation: "ON_OUTPUT_INVALID",
  quality: { schemaValidity: 1, configMatch: 1, duplicates: 0, topicCoverage: 0.9, injectionClean: 1 },
  typicalUsage: { inputTokens: 5_000, outputTokens: 9_000 },
  maxOutputTokens: 24_000,
  timeoutMs: 120_000,
});

/**
 * `work-generator` v1 (contracts/work-generator.md): an L2 agent whose proposal becomes one DRAFT
 * work in the same transaction (`materialize`); approved only through the work bank (the 006
 * decision route refuses APPROVE). DISABLED until the admin enables it after the release gate.
 */
export const WORK_GENERATOR = defineAgent({
  key: WORK_GENERATOR_KEY,
  version: 1,
  initialStatus: "DISABLED",
  name: "Gerador de trabalhos",
  description: "Prepara o rascunho de um trabalho a partir de tópicos da ementa, para o professor revisar e aprovar.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ia.trabalhos.gerar",
  prompt: { key: "work-generation", version: 1, status: "ACTIVE", systemInstructions: WORK_GENERATION_V1 },
  output: { version: 1, schema: GeneratedWorkSchema },
  input: z.strictObject({}),
  taskKey: WORK_GENERATION_TASK.key,
  toolKeys: [readWorkGenerationRequestTool.key],
  resourceTypes: [WORK_GENERATION_REQUEST],
  onToolDenied: "fail",
  limits: { maxModelCalls: 3, maxToolCalls: 2 },
  buildContext: (context) => ({ requestId: context.resource?.id }),
  proposal: {
    type: WORK_GENERATION_PROPOSAL_TYPE,
    approveThroughDomain: true,
    // Unused while `build` exists; kept for the hook-less path of the foundation.
    itemIds: (output) => GeneratedWorkSchema.parse(output).questions.map((_, index) => workQuestionItemId(index)),
    build: buildWorkProposal,
    materialize: materializeGeneratedWork,
  },
});

/** Everything 011 registers in the AI foundation; the catalog and the provider come from `productionAiDefinitions`. */
export function workAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [WORK_GENERATOR],
    tools: [readWorkGenerationRequestTool],
    tasks: [WORK_GENERATION_TASK],
    resources: { [WORK_GENERATION_REQUEST]: workGenerationRequestOwnership },
  };
}
