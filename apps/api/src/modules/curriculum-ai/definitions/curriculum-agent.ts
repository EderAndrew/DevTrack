import { CurriculumExtractionOutputV2Schema } from "@repo/contracts";
import { z } from "zod";
import { GENERATION_MODEL_FAMILIES, type ModelTier } from "../../ai/definitions/model-families";
import { type AiDefinitions, defineAgent, defineTask, type TaskDefinition } from "../../ai/definitions/types";
import { buildCurriculumProposal } from "../proposal/build-proposal";
import { itemIdsOf } from "../proposal/item-ids";
import { CURRICULUM_EXTRACTION_V2 } from "./curriculum-extraction.prompt";
import { readCurriculumDocumentTool } from "./read-curriculum-document.tool";
import { syllabusDocumentOwnership } from "./syllabus-document.ownership";

export const CURRICULUM_AGENT_KEY = "curriculum-agent";
export const CURRICULUM_PROPOSAL_TYPE = "CURRICULUM_EXTRACTION";

/** The families the Curriculum Agent's tasks may use (009 FR-001): every one with generation models. */
const CURRICULUM_FAMILIES = [...GENERATION_MODEL_FAMILIES];

/**
 * The 007 quality thresholds (SC-005, SC-006) an approval must meet (contracts/catalog-and-quality-gate.md),
 * and since 010 the language of every golden case (SC-012).
 */
const EXTRACTION_QUALITY = { itemRecall: 0.9, schemaValidity: 1, unsupportedWithoutWarning: 0, inventedFields: 0, injectionClean: 1, languageMatch: 1 };

/**
 * The task of the agent (008 research G2) with its model policy (009 research H5, H12, FR-026):
 * BASIC, the cheapest approved model of that tier, a fallback of the same tier, and one step up
 * to STANDARD only when the output fails validation. The generation settings are the 007 ones.
 */
export const CURRICULUM_EXTRACTION_TASK = defineTask({
  key: "curriculum-extraction",
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  maxTier: "STANDARD",
  allowedFamilies: CURRICULUM_FAMILIES,
  requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER",
  escalation: "ON_OUTPUT_INVALID",
  quality: EXTRACTION_QUALITY,
  typicalUsage: { inputTokens: 12_000, outputTokens: 3_000 },
  parameters: { effort: "low" },
  maxOutputTokens: 16_000,
  timeoutMs: 60_000,
});

/** A Curriculum Agent task registered without an agent yet (009 research H13, spec Q2). */
const futureTask = (key: string, tier: ModelTier): TaskDefinition =>
  defineTask({
    key,
    mode: "GENERATION",
    minimumTier: tier,
    preferredTier: tier,
    allowedFamilies: CURRICULUM_FAMILIES,
    requiredCapabilities: ["structuredOutput"],
    fallback: "SAME_TIER",
    escalation: "NONE",
    quality: { schemaValidity: 1 },
    typicalUsage: { inputTokens: 8_000, outputTokens: 2_000 },
    maxOutputTokens: 16_000,
    timeoutMs: 60_000,
  });

/**
 * The other seven policies of the Curriculum Agent (009 FR-026): synced and shown in "Operação de
 * IA", run by no agent in this feature.
 */
export const CURRICULUM_FUTURE_TASKS: readonly TaskDefinition[] = [
  futureTask("curriculum-document-reading", "BASIC"),
  futureTask("curriculum-field-completion", "BASIC"),
  futureTask("curriculum-simple-suggestions", "BASIC"),
  futureTask("curriculum-summary", "BASIC"),
  futureTask("curriculum-pedagogical-review", "STANDARD"),
  futureTask("curriculum-restructuring", "STANDARD"),
  futureTask("curriculum-complex-comparison", "ADVANCED"),
];

/**
 * `curriculum-agent` v3 (010 research X18): v2 (008 research G4, its task instead of a model
 * config) that also proposes the syllabus' programming language — prompt v2, output schema v2
 * with `languageKey`, the read tool returning the catalog. Task, tools, limits and the rest of the
 * proposal are the same.
 */
export const CURRICULUM_AGENT = defineAgent({
  key: CURRICULUM_AGENT_KEY,
  version: 3,
  // Enabled by the admin in "Operação de IA" after the on-demand eval passes (FR-051).
  initialStatus: "DISABLED",
  name: "Curriculum Agent",
  description: "Assistente responsável por extrair e estruturar informações existentes em documentos institucionais de ementa.",
  riskLevel: "L2_PROPOSAL",
  requiredPermission: "ementas.revisar",
  prompt: { key: "curriculum-extraction", version: 2, status: "ACTIVE", systemInstructions: CURRICULUM_EXTRACTION_V2 },
  output: { version: 2, schema: CurriculumExtractionOutputV2Schema },
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
    itemIds: (output) => {
      const { languageKey, ...extraction } = CurriculumExtractionOutputV2Schema.parse(output);
      return itemIdsOf(extraction, languageKey !== null);
    },
    build: buildCurriculumProposal,
  },
});

/**
 * Everything 007 registers in the AI foundation (research C12.7), with the 009 task policies; the
 * catalog and the provider come from `productionAiDefinitions`.
 */
export function curriculumAiDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [CURRICULUM_AGENT],
    tools: [readCurriculumDocumentTool],
    tasks: [CURRICULUM_EXTRACTION_TASK, ...CURRICULUM_FUTURE_TASKS],
    resources: { SYLLABUS_DOCUMENT: syllabusDocumentOwnership },
  };
}
