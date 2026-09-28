import { compareTiers, isModelTier, MODEL_CAPABILITIES, MODEL_MODES } from "../definitions/model-families";
import type { ModelApproval, TaskDefinition } from "../definitions/types";

/**
 * What is wrong with a task's policy, or null (research H5): the tiers in order, families of the
 * allowlist, known capabilities, the mode's own fields. An invalid policy leaves only that task
 * unavailable (`POLICY_INVALID`, 009 FR-006, FR-027). A literal JSON value, so the stored policy
 * can be checked again where the route is chosen.
 */
export function taskPolicyProblem(task: TaskPolicyFields, families: readonly string[]): string | null {
  const maxTier = task.maxTier ?? task.preferredTier;
  if (![task.minimumTier, task.preferredTier, maxTier].every(isModelTier)) return "tier";
  if (compareTiers(task.minimumTier, task.preferredTier) > 0 || compareTiers(task.preferredTier, maxTier) > 0) return "tier order";
  if (!MODEL_MODES.includes(task.mode)) return "mode";
  if (!Array.isArray(task.allowedFamilies) || task.allowedFamilies.length === 0) return "families";
  if (!task.allowedFamilies.every((family) => families.includes(family))) return "family not allowed";
  if (!Array.isArray(task.requiredCapabilities) || !task.requiredCapabilities.every((c) => MODEL_CAPABILITIES.includes(c))) return "capabilities";
  if (task.fallback !== "SAME_TIER" && task.fallback !== "NONE") return "fallback";
  if (task.escalation !== "NONE" && task.escalation !== "ON_OUTPUT_INVALID") return "escalation";
  if (!task.quality || !Object.entries(task.quality).every(([metric, value]) => QUALITY_METRICS.has(metric) && Number.isFinite(value) && value >= 0)) {
    return "quality";
  }
  const usage = task.typicalUsage;
  if (!usage || ![usage.inputTokens, usage.outputTokens].every((n) => Number.isInteger(n) && n >= 0)) return "typical usage";
  if (task.mode === "DECISION") {
    if (task.minConfidence === undefined || !(task.minConfidence > 0.5 && task.minConfidence <= 1)) return "min confidence";
    if (task.requiredCapabilities.some((c) => c === "structuredOutput" || c === "tools")) return "decision capabilities";
    if (task.escalation !== "NONE") return "decision escalation";
  } else if (task.minConfidence !== undefined) {
    return "min confidence";
  }
  return null;
}

/** The policy part of a task, as `ai_tasks.policy` stores it. */
export type TaskPolicyFields = Pick<
  TaskDefinition,
  | "mode"
  | "minimumTier"
  | "preferredTier"
  | "maxTier"
  | "allowedFamilies"
  | "requiredCapabilities"
  | "fallback"
  | "escalation"
  | "quality"
  | "typicalUsage"
  | "minConfidence"
>;

export function taskPolicyOf(task: TaskDefinition): TaskPolicyFields {
  const { mode, minimumTier, preferredTier, maxTier, allowedFamilies, requiredCapabilities, fallback, escalation, quality, typicalUsage, minConfidence } = task;
  return { mode, minimumTier, preferredTier, maxTier, allowedFamilies, requiredCapabilities, fallback, escalation, quality, typicalUsage, minConfidence };
}

/** Whether an approval's metrics meet every threshold of the task (research H6); a missing metric fails. */
export function approvalMeetsQuality(approval: Pick<ModelApproval, "metrics">, quality: Record<string, number>): boolean {
  return Object.entries(quality).every(([metric, threshold]) => {
    const value = approval.metrics[metric];
    return typeof value === "number" && meets(metric, value, threshold);
  });
}

/**
 * The metrics a task may require (the 007 scorer's, contracts/catalog-and-quality-gate.md, and
 * `accuracy` for decision tasks). Counts of failures are ceilings; the others are floors.
 */
const CEILING_METRICS: ReadonlySet<string> = new Set(["unsupportedWithoutWarning", "inventedFields"]);
const QUALITY_METRICS: ReadonlySet<string> = new Set([...CEILING_METRICS, "itemRecall", "schemaValidity", "injectionClean", "languageMatch", "accuracy"]);
const meets = (metric: string, value: number, threshold: number) => (CEILING_METRICS.has(metric) ? value <= threshold : value >= threshold);
