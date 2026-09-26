import { CurriculumExtractionOutputSchema } from "@repo/contracts";
import { z } from "zod";
import { DEFAULT_MODEL_CONFIG_KEY } from "../../ai/definitions/model-config-keys";
import { type AiDefinitions, defineAgent, defineTask } from "../../ai/definitions/types";
import { buildCurriculumProposal } from "../proposal/build-proposal";
import { itemIdsOf } from "../proposal/item-ids";
import { CURRICULUM_EXTRACTION_V1 } from "./curriculum-extraction.prompt";
import { readCurriculumDocumentTool } from "./read-curriculum-document.tool";
import { syllabusDocumentOwnership } from "./syllabus-document.ownership";

export const CURRICULUM_AGENT_KEY = "curriculum-agent";
export const CURRICULUM_PROPOSAL_TYPE = "CURRICULUM_EXTRACTION";

/**
 * The task of the agent (008 research G2): the settings of the 007 model config, routed to the
 * default model config. Production adds the fallback when one is configured.
 */
export const CURRICULUM_EXTRACTION_TASK = defineTask({
  key: "curriculum-extraction",
  primaryModelConfigKey: DEFAULT_MODEL_CONFIG_KEY,
  parameters: { effort: "low" },
  maxOutputTokens: 16_000,
  timeoutMs: 60_000,
});

/**
 * `curriculum-agent` v2 (contracts/curriculum-agent.md; 008 research G4): v1 with its task instead
 * of a model config. Instructions, output schema, tools, limits and proposal are the same.
 */
export const CURRICULUM_AGENT = defineAgent({
  key: CURRICULUM_AGENT_KEY,
  version: 2,
  // Enabled by the admin in "Operação de IA" after the on-demand eval passes (FR-051).
  initialStatus: "DISABLED",
  name: "Curriculum Agent",
  description: "Assistente responsável por extrair e estruturar informações existentes em documentos institucionais de ementa.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ementas.revisar",
  prompt: { key: "curriculum-extraction", version: 1, status: "ACTIVE", systemInstructions: CURRICULUM_EXTRACTION_V1 },
  output: { version: 1, schema: CurriculumExtractionOutputSchema },
  input: z.strictObject({}),
  taskKey: CURRICULUM_EXTRACTION_TASK.key,
  toolKeys: [readCurriculumDocumentTool.key],
  resourceTypes: ["SYLLABUS_DOCUMENT"],
  onToolDenied: "continue",
  limits: { maxModelCalls: 3, maxToolCalls: 2 },
  buildContext: (context) => ({ documentId: context.resource?.id }),
  proposal: {
    type: CURRICULUM_PROPOSAL_TYPE,
    approveThroughDomain: true,
    // Unused while `build` exists; kept for the hook-less path of the foundation.
    itemIds: (output) => itemIdsOf(CurriculumExtractionOutputSchema.parse(output)),
    build: buildCurriculumProposal,
  },
});

/**
 * Everything 007 registers in the AI foundation (research C12.7); the model configs and the
 * provider come from `productionAiDefinitions` (008 research G3).
 */
export function curriculumAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [CURRICULUM_AGENT],
    tools: [readCurriculumDocumentTool],
    tasks: [CURRICULUM_EXTRACTION_TASK],
    resources: { SYLLABUS_DOCUMENT: syllabusDocumentOwnership },
  };
}
