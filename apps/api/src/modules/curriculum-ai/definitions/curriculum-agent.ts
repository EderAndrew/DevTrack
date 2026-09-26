import { CurriculumExtractionOutputSchema } from "@repo/contracts";
import { z } from "zod";
import { type AiDefinitions, defineAgent, defineModelConfig } from "../../ai/definitions/types";
import { buildCurriculumProposal } from "../proposal/build-proposal";
import { itemIdsOf } from "../proposal/item-ids";
import { CURRICULUM_EXTRACTION_V1 } from "./curriculum-extraction.prompt";
import { readCurriculumDocumentTool } from "./read-curriculum-document.tool";
import { syllabusDocumentOwnership } from "./syllabus-document.ownership";

export const CURRICULUM_AGENT_KEY = "curriculum-agent";
export const CURRICULUM_PROPOSAL_TYPE = "CURRICULUM_EXTRACTION";
export const CURRICULUM_MODEL_CONFIG_KEY = "curriculum-extraction-default";

/** `curriculum-agent` v1 (contracts/curriculum-agent.md). */
export const CURRICULUM_AGENT = defineAgent({
  key: CURRICULUM_AGENT_KEY,
  version: 1,
  // Enabled by the admin in "Operação de IA" after the on-demand eval passes (FR-051).
  initialStatus: "DISABLED",
  name: "Curriculum Agent",
  description: "Assistente responsável por extrair e estruturar informações existentes em documentos institucionais de ementa.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ementas.revisar",
  prompt: { key: "curriculum-extraction", version: 1, status: "ACTIVE", systemInstructions: CURRICULUM_EXTRACTION_V1 },
  output: { version: 1, schema: CurriculumExtractionOutputSchema },
  input: z.strictObject({}),
  modelConfigKey: CURRICULUM_MODEL_CONFIG_KEY,
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

export const CURRICULUM_MODEL_CONFIG = defineModelConfig({
  key: CURRICULUM_MODEL_CONFIG_KEY,
  provider: "anthropic",
  model: "claude-opus-5",
  initialStatus: "ENABLED",
  parameters: { effort: "low" },
  maxOutputTokens: 16_000,
  timeoutMs: 60_000,
  price: { inputPerMTok: "5", outputPerMTok: "25", currency: "USD" },
});

/** Everything 007 registers in the AI foundation; the provider comes separately (research C12.7). */
export function curriculumAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "modelConfigs" | "resources"> {
  return {
    agents: [CURRICULUM_AGENT],
    tools: [readCurriculumDocumentTool],
    modelConfigs: [CURRICULUM_MODEL_CONFIG],
    resources: { SYLLABUS_DOCUMENT: syllabusDocumentOwnership },
  };
}
