import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { AgentDefinition } from "../definitions/types";

/** Global limits lowered by the agent's own, never raised (006 FR-048, research A17). */
export function effectiveLimits(global: AiExecutionLimits, agent: Pick<AgentDefinition, "limits">): AiExecutionLimits {
  const own = agent.limits ?? {};
  return Object.fromEntries(
    Object.entries(global).map(([name, value]) => {
      const lower = own[name as keyof AiExecutionLimits];
      return [name, typeof lower === "number" ? Math.min(value, lower) : value];
    }),
  ) as unknown as AiExecutionLimits;
}
