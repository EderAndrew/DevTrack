import type { ModelCapabilities, ModelLifecycle, ModelMode, ModelTier } from "../definitions/model-families";
import type { ModelPrice } from "../definitions/types";
import { type TaskPolicyFields, taskPolicyProblem } from "./task-policy";
import { estimatedCallCost } from "./estimate-cost";

/**
 * The deterministic model choice of a task (009 research H7, contracts/model-policy.md). Pure: it
 * reads only what it receives, so the same input always gives the same route. Quality first (a
 * valid approval for the task), cost second, never a model's own opinion (FR-011).
 */

/** A catalog entry as the policy sees it, for one task. */
export interface PolicyCatalogEntry {
  key: string;
  family: string;
  mode: ModelMode;
  tier: ModelTier;
  lifecycle: ModelLifecycle;
  capabilities: ModelCapabilities;
  price: ModelPrice | null;
  priority: number;
  /** Has an approval for the task whose metrics meet its thresholds (research H6). */
  approved: boolean;
}

/** Why an entry can't take a call now: no provider registered, or disabled / circuit open (008). */
export type EntryHealth = "USABLE" | "NO_PROVIDER" | "BLOCKED";

export type SelectionReason = "OVERRIDE" | "LOWEST_COST" | "ONLY_CANDIDATE" | "DEPRECATED_ONLY";

export type UnavailableReason = "NO_APPROVED_MODEL" | "POLICY_INVALID" | "PROVIDER_NOT_REGISTERED" | "ALL_BLOCKED";

export interface SelectRouteInput<E extends PolicyCatalogEntry> {
  task: TaskPolicyFields;
  /** The preferred tier, or the escalation target. */
  tier: ModelTier;
  /** The model families in force (009 FR-001). */
  families: readonly string[];
  catalog: readonly E[];
  /** Model config key fixed by the admin for the task (research H11). */
  override: string | null;
  health(entry: E): EntryHealth;
}

export type SelectedRoute<E extends PolicyCatalogEntry> =
  | {
      primary: E;
      fallback: E | null;
      reason: SelectionReason;
      /** An override was set but its model doesn't qualify now, so the policy ignored it (US7-4). */
      overrideIgnored: boolean;
    }
  | { unavailable: UnavailableReason };

export function selectRoute<E extends PolicyCatalogEntry>(input: SelectRouteInput<E>): SelectedRoute<E> {
  const { task, tier } = input;
  if (taskPolicyProblem(task, input.families) !== null) return { unavailable: "POLICY_INVALID" };

  const qualifying = qualifyingEntries(input);
  if (qualifying.length === 0) return { unavailable: "NO_APPROVED_MODEL" };

  const production = order(qualifying.filter((entry) => entry.lifecycle === "PRODUCTION"), task, input.override);
  const deprecated = order(qualifying.filter((entry) => entry.lifecycle === "DEPRECATED"), task, input.override);
  // DEPRECATED serves only when no PRODUCTION model remains (009 FR-016).
  const candidates = production.length > 0 ? [...production, ...deprecated] : deprecated;
  const primary = candidates[0]!;

  // The health never reorders the policy's choice: an unusable primary stays the primary, and the
  // 008 gateway goes to the fallback (recorded as such, 008 G6); so the fallback must be usable.
  const health = new Map(qualifying.map((entry) => [entry.key, input.health(entry)]));
  const usable = (entry: E) => health.get(entry.key) === "USABLE";
  let fallback: E | null = null;
  if (task.fallback === "SAME_TIER") {
    const rest = candidates.slice(1).filter(usable);
    // Another family first, so one vendor's outage doesn't take both legs (009 FR-012).
    fallback = rest.find((entry) => entry.family !== primary.family) ?? rest[0] ?? null;
  }
  if (!usable(primary) && fallback === null) {
    const noProvider = qualifying.every((entry) => health.get(entry.key) === "NO_PROVIDER");
    return { unavailable: noProvider ? "PROVIDER_NOT_REGISTERED" : "ALL_BLOCKED" };
  }

  const overrideUsed = input.override !== null && primary.key === input.override;
  const reason: SelectionReason = overrideUsed
    ? "OVERRIDE"
    : production.length === 0
      ? "DEPRECATED_ONLY"
      : production.length === 1
        ? "ONLY_CANDIDATE"
        : "LOWEST_COST";
  return { primary, fallback, reason, overrideIgnored: input.override !== null && !overrideUsed };
}

/**
 * Everything but the health: the models that would serve the task at `tier` (family in force and
 * allowed by the task, same mode, every required capability, PRODUCTION or DEPRECATED, a valid
 * approval for the task). Assumes a valid policy.
 */
export function qualifyingEntries<E extends PolicyCatalogEntry>(input: Pick<SelectRouteInput<E>, "task" | "tier" | "families" | "catalog">): E[] {
  const { task, tier } = input;
  return input.catalog.filter(
    (entry) =>
      input.families.includes(entry.family) &&
      task.allowedFamilies.includes(entry.family) &&
      entry.mode === task.mode &&
      task.requiredCapabilities.every((capability) => entry.capabilities[capability] === true) &&
      (entry.lifecycle === "PRODUCTION" || entry.lifecycle === "DEPRECATED") &&
      entry.approved &&
      entry.tier === tier,
  );
}

/** Override first, then the estimated cost (unknown last), `priority` descending, key. */
function order<E extends PolicyCatalogEntry>(entries: E[], task: TaskPolicyFields, override: string | null): E[] {
  const cost = new Map(entries.map((entry) => [entry.key, estimatedCallCost(task.typicalUsage, entry.price)]));
  return [...entries].sort((a, b) => {
    if (override !== null && (a.key === override) !== (b.key === override)) return a.key === override ? -1 : 1;
    const ca = cost.get(a.key) ?? null;
    const cb = cost.get(b.key) ?? null;
    if (ca !== cb) {
      if (ca === null) return 1;
      if (cb === null) return -1;
      return ca < cb ? -1 : 1;
    }
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}
