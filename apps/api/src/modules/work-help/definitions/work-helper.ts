import { WorkHelperOutputSchema } from "@repo/contracts";
import { z } from "zod";
import { GENERATION_MODEL_FAMILIES } from "../../ai/definitions/model-families";
import { type AgentDefinition, defineAgent, defineTask } from "../../ai/definitions/types";
import { WORK_HELP_REQUEST } from "./request-content";
import { readWorkHelpRequestTool } from "./read-work-help-request.tool";
import { WORK_HELP_V2 } from "./work-help.prompt";

/** The AI help agent (contracts/work-helper.md): its status and its task's route decide the availability (research F3). */
export const WORK_HELPER_KEY = "work-helper";
export const WORK_HELP_PROPOSAL_TYPE = "WORK_HELP";
/** The one item of a help proposal: the orientation. */
export const WORK_HELP_ITEM_ID = "guidance";

/**
 * The task of the help (015 research F8): BASIC only — latency matters more than a retry one tier
 * up —, a same-tier fallback, no escalation. The 009 policy picks the model.
 */
export const WORK_HELP_TASK = defineTask({
  key: "work-help",
  mode: "GENERATION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  maxTier: "BASIC",
  allowedFamilies: [...GENERATION_MODEL_FAMILIES],
  requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER",
  escalation: "NONE",
  quality: { schemaValidity: 1, leakFree: 1, injectionClean: 1, scopeAccuracy: 0.9, relevance: 0.9 },
  typicalUsage: { inputTokens: 3_000, outputTokens: 700 },
  maxOutputTokens: 2_000,
  timeoutMs: 20_000,
});

/** The domain rule that settles a help proposal (`help/materialize.ts`, which reads the answer key). */
type SettleHelp = NonNullable<NonNullable<AgentDefinition["proposal"]>["materialize"]>;

/**
 * `work-helper` v2 (contracts/work-helper.md; v2 carries prompt v2, 2026-10-08): an L2 agent whose proposal — one orientation — nobody
 * reviews before the student reads it; its domain rule settles it (research F9): `materialize` runs
 * the leak check and answers APPROVE (delivered) or REJECT (out of scope or blocked). DISABLED until
 * the admin enables it after the release gate (F16). Its hourly limit is sized for whole classes (F12).
 * The rule comes in as a parameter: nothing that builds the model's input imports the module that
 * reads the answer key (`work-help-boundary.spec.ts`); `work-help.definitions.ts` wires them.
 */
export function workHelperAgent(materialize: SettleHelp): AgentDefinition {
  return defineAgent({
    key: WORK_HELPER_KEY,
    version: 2,
    initialStatus: "DISABLED",
    name: "Ajuda da IA nos trabalhos",
    description: "Orienta o aluno numa questão do trabalho, sem dar a resposta, quando o professor libera a ajuda.",
    riskLevel: "L2_PROPOSAL",
    requiredPermission: "ia.ajuda.pedir",
    prompt: { key: "work-help", version: 2, status: "ACTIVE", systemInstructions: WORK_HELP_V2 },
    output: { version: 1, schema: WorkHelperOutputSchema },
    input: z.strictObject({}),
    taskKey: WORK_HELP_TASK.key,
    toolKeys: [readWorkHelpRequestTool.key],
    resourceTypes: [WORK_HELP_REQUEST],
    onToolDenied: "fail",
    limits: { maxModelCalls: 2, maxToolCalls: 1 },
    hourlyLimit: (config) => config.rateLimit.workHelpAgentPerHour,
    buildContext: (context) => ({ requestId: context.resource?.id }),
    proposal: {
      type: WORK_HELP_PROPOSAL_TYPE,
      itemIds: () => [WORK_HELP_ITEM_ID],
      settle: "ON_MATERIALIZE",
      materialize,
    },
  });
}
