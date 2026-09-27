import type { TaskDefinition } from "../../../src/modules/ai/definitions/types";
import { defineTask } from "../../../src/modules/ai/definitions/types";

/**
 * Tasks of the tests (008 research G2, 009 T014). Since 009 a task declares a policy, not a route:
 * `routedTask` writes the policy that picks the same models the 006/008 suites always used, by
 * approving only those fake models for the task. `typicalUsage` is zeroed, so the cost ties and
 * the catalog's `priority` orders them (`fake-default` > `fake-alt` > `fake-no-price`): the first
 * model named is the primary and, with `fallback`, the second one is the fallback.
 */
// `reference-routed` (008/US7) declares its own policy, importing only the definition helpers.
const APPROVALS = new Map<string, string[]>([
  ["fake-default", ["reference-routed"]],
  ["fake-alt", ["reference-routed"]],
]);

/** Keys of the tasks a fake model is approved for (see `referenceCatalog`). */
export const approvedTaskKeys = (modelKey: string): string[] => APPROVALS.get(modelKey) ?? [];

export function routedTask(
  task: Omit<TaskDefinition, "mode" | "minimumTier" | "preferredTier" | "allowedFamilies" | "requiredCapabilities" | "fallback" | "escalation" | "quality" | "typicalUsage"> &
    Partial<TaskDefinition>,
  models: [primary: string, fallback?: string],
): TaskDefinition {
  for (const model of models) {
    if (model) APPROVALS.set(model, [...new Set([...approvedTaskKeys(model), task.key])]);
  }
  return defineTask({
    mode: "GENERATION",
    minimumTier: "BASIC",
    preferredTier: "BASIC",
    allowedFamilies: ["fake"],
    requiredCapabilities: [],
    fallback: models[1] ? "SAME_TIER" : "NONE",
    escalation: "NONE",
    quality: { schemaValidity: 1 },
    typicalUsage: { inputTokens: 0, outputTokens: 0 },
    ...task,
  });
}

/** Tasks of the reference agents, with the settings the fake configs had, so the 006 behavior stays the same. */
export const REFERENCE_DEFAULT_TASK = routedTask({ key: "reference-default", parameters: { temperature: 0 }, maxOutputTokens: 2000, timeoutMs: 30_000 }, ["fake-default"]);

export const REFERENCE_ALT_TASK = routedTask({ key: "reference-alt", maxOutputTokens: 1000, timeoutMs: 30_000 }, ["fake-alt"]);

export const REFERENCE_TASKS = [REFERENCE_DEFAULT_TASK, REFERENCE_ALT_TASK];
