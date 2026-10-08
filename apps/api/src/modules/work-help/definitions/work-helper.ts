import type { AiDefinitions } from "../../ai/definitions/types";

/** The AI help agent (contracts/work-helper.md): its status and its task's route decide the availability (research F3). */
export const WORK_HELPER_KEY = "work-helper";

/**
 * Everything 015 registers in the AI foundation for the AI help (research F8): the `work-helper`
 * agent, its read tool, the `work-help` task and the `WORK_HELP_REQUEST` resource arrive with US3;
 * the catalog and the provider come from `productionAiDefinitions`.
 */
export function workHelpDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return { agents: [], tools: [], tasks: [], resources: {} };
}
