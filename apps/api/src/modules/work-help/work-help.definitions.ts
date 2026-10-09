import type { AiDefinitions } from "../ai/definitions/types";
import { readWorkHelpRequestTool } from "./definitions/read-work-help-request.tool";
import { WORK_HELP_REQUEST } from "./definitions/request-content";
import { workHelpRequestOwnership } from "./definitions/request.ownership";
import { WORK_HELP_TASK, workHelperAgent } from "./definitions/work-helper";
import { materializeHelp } from "./help/materialize";

/**
 * Everything 015 registers in the AI foundation for the AI help (research F8): the `work-helper`
 * agent with its settling rule, its read tool, the `work-help` task and the `WORK_HELP_REQUEST`
 * resource; the catalog and the provider come from `productionAiDefinitions`.
 */
export function workHelpDefinitions(): Pick<AiDefinitions, "agents" | "tools" | "tasks" | "resources"> {
  return {
    agents: [workHelperAgent(materializeHelp)],
    tools: [readWorkHelpRequestTool],
    tasks: [WORK_HELP_TASK],
    resources: { [WORK_HELP_REQUEST]: workHelpRequestOwnership },
  };
}
