import type { AiDefinitions } from "../../ai/definitions/types";

/**
 * Everything 015 registers in the AI foundation for the AI help (research F8): the `work-helper`
 * agent, its read tool, the `work-help` task and the `WORK_HELP_REQUEST` resource arrive with US3;
 * the catalog and the provider come from `productionAiDefinitions`.
 */
export function workHelpDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return { agents: [], tools: [], tasks: [], resources: {} };
}
