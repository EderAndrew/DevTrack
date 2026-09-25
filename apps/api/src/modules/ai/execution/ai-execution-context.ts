import type { AiResourceRef } from "@repo/contracts";
import type { AiExecutionContext } from "../definitions/types";

export interface ContextFields {
  executionId: string;
  userId: string;
  workspaceId: string;
  agentKey: string;
  agentVersionId: string;
  riskLevel: AiExecutionContext["riskLevel"];
  permissions: Iterable<string>;
  allowedToolKeys: readonly string[];
  resource: AiResourceRef | null;
  correlationId: string;
  deadline: Date;
  signal: AbortSignal;
}

/**
 * The frozen context of one execution (006 FR-028, FR-055, research A7): fixed before the first
 * model call from the database, never from the model's output. Deep-frozen so no step can widen
 * permissions, tools, workspace or risk level.
 */
export function createExecutionContext(fields: ContextFields): AiExecutionContext {
  return Object.freeze({
    executionId: fields.executionId,
    userId: fields.userId,
    workspaceId: fields.workspaceId,
    agentKey: fields.agentKey,
    agentVersionId: fields.agentVersionId,
    riskLevel: fields.riskLevel,
    permissions: Object.freeze([...fields.permissions].sort()),
    allowedToolKeys: Object.freeze([...fields.allowedToolKeys]),
    resource: fields.resource ? Object.freeze({ ...fields.resource }) : null,
    correlationId: fields.correlationId,
    deadline: new Date(fields.deadline),
    signal: fields.signal,
  });
}
