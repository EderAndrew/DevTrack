import { GeneratedExamSchema } from "@repo/contracts";
import { z } from "zod";
import { GENERATION_MODEL_FAMILIES } from "../../ai/definitions/model-families";
import { type AiDefinitions, defineAgent, defineTask } from "../../ai/definitions/types";
import { buildExamProposal, examQuestionItemId } from "../generation/build-proposal";
import { materializeGeneratedExam } from "../generation/materialize";
import { recordRejectedExamGeneration } from "../generation/rejected";
import { EXAM_GENERATION_REQUEST } from "../generation/request-content";
import { EXAM_GENERATION_V1 } from "./exam-generation.prompt";
import { readExamGenerationRequestTool } from "./read-exam-generation-request.tool";
import { examGenerationRequestOwnership } from "./request.ownership";

export const EXAM_GENERATOR_KEY = "exam-generator";
export const EXAM_GENERATION_PROPOSAL_TYPE = "EXAM_GENERATION";

/**
 * The task of the generator (018 research T14, contracts/exam-generator.md): the 009 policy picks the
 * model — the cheapest approved one of BASIC, a same-tier fallback, one step up to STANDARD after an
 * invalid output. The exam's difficulty is a field of the request, never of the task.
 */
export const EXAM_GENERATION_TASK = defineTask({
  key: "exam-generation",
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  maxTier: "STANDARD",
  allowedFamilies: [...GENERATION_MODEL_FAMILIES],
  requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER",
  escalation: "ON_OUTPUT_INVALID",
  quality: { schemaValidity: 1, configMatch: 1, duplicates: 0, topicCoverage: 0.9, injectionClean: 1 },
  typicalUsage: { inputTokens: 6_000, outputTokens: 14_000 },
  maxOutputTokens: 32_000,
  timeoutMs: 150_000,
});

/**
 * `exam-generator` v1 (contracts/exam-generator.md): an L2 agent whose proposal becomes one DRAFT exam
 * in the same transaction (`materialize`); approved only through the Banco de Provas (the 006 decision
 * route refuses APPROVE), never applied, published, closed or graded by it (FR-006). DISABLED until the
 * admin enables it after the release gate.
 */
export const EXAM_GENERATOR = defineAgent({
  key: EXAM_GENERATOR_KEY,
  version: 1,
  initialStatus: "DISABLED",
  name: "Gerador de provas",
  description: "Prepara o rascunho de uma prova a partir de tópicos da ementa, para o professor revisar e aprovar.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ia.provas.gerar",
  prompt: { key: "exam-generation", version: 1, status: "ACTIVE", systemInstructions: EXAM_GENERATION_V1 },
  output: { version: 1, schema: GeneratedExamSchema },
  input: z.strictObject({}),
  taskKey: EXAM_GENERATION_TASK.key,
  toolKeys: [readExamGenerationRequestTool.key],
  resourceTypes: [EXAM_GENERATION_REQUEST],
  onToolDenied: "fail",
  limits: { maxModelCalls: 3, maxToolCalls: 2 },
  buildContext: (context) => ({ requestId: context.resource?.id }),
  proposal: {
    type: EXAM_GENERATION_PROPOSAL_TYPE,
    approveThroughDomain: true,
    // Unused while `build` exists; kept for the hook-less path of the foundation.
    itemIds: (output) => GeneratedExamSchema.parse(output).questions.map((_, index) => examQuestionItemId(index)),
    build: buildExamProposal,
    materialize: materializeGeneratedExam,
    rejected: recordRejectedExamGeneration,
  },
});

/** Everything 018 registers in the AI foundation; the catalog and the provider come from `productionAiDefinitions`. */
export function examAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [EXAM_GENERATOR],
    tools: [readExamGenerationRequestTool],
    tasks: [EXAM_GENERATION_TASK],
    resources: { [EXAM_GENERATION_REQUEST]: examGenerationRequestOwnership },
  };
}
