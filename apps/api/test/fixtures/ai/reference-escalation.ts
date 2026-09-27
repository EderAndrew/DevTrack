import { defineAgent, defineCatalogModel, type TaskDefinition } from "../../../src/modules/ai/definitions/types";
import { REFERENCE_L2 } from "./reference-agents";
import { testApproval } from "./model-configs";
import { REFERENCE_ROUTED } from "./reference-routed";
import { routedTask } from "./tasks";

/**
 * Tiers above BASIC for the escalation suites (009/US4, contracts/model-policy.md "Escalation"),
 * registered only by the suites that use them (`createAiTestApp({ agents, tasks, modelConfigs })`).
 * The BASIC models are the reference `fake-default` (primary) and `fake-alt` (fallback).
 */
const escalationTask = (key: string, policy: Partial<TaskDefinition>, basicModels: [string, string?] = ["fake-default", "fake-alt"]): TaskDefinition =>
  routedTask(
    {
      key,
      escalation: "ON_OUTPUT_INVALID",
      maxTier: "STANDARD",
      requiredCapabilities: ["structuredOutput"],
      parameters: { temperature: 0 },
      maxOutputTokens: 1000,
      timeoutMs: 30_000,
      ...policy,
    },
    basicModels,
  );

/** BASIC → STANDARD once, when the output fails validation. */
export const ESCALATING_TASK = escalationTask("reference-escalating", {});

/** The same models, no escalation: an invalid output fails as in 006 (009/US4-4). */
export const NO_ESCALATION_TASK = escalationTask("reference-no-escalation", { escalation: "NONE", maxTier: undefined });

/** Allows STANDARD, but only an ADVANCED model is approved above BASIC: never skips a tier. */
export const SKIP_TIER_TASK = escalationTask("reference-skip-tier", {});

/** Preferred STANDARD with ADVANCED explicitly allowed as the escalation target (009/FR-014). */
export const TO_ADVANCED_TASK = escalationTask("reference-to-advanced", { minimumTier: "STANDARD", preferredTier: "STANDARD", maxTier: "ADVANCED", fallback: "NONE" }, [
  "fake-standard",
]);

const aboveBasic = (entry: { key: string; model: string; tier: "STANDARD" | "ADVANCED"; tasks: string[] }) =>
  defineCatalogModel({
    key: entry.key,
    provider: "fake",
    family: "fake",
    model: entry.model,
    tier: entry.tier,
    mode: "GENERATION",
    lifecycle: "PRODUCTION",
    initialStatus: "ENABLED",
    contextWindow: 100_000,
    capabilities: { structuredOutput: true, tools: true, vision: false, reasoning: false },
    maxOutputTokens: 1000,
    timeoutMs: 30_000,
    price: { inputPerMTok: "3.00", outputPerMTok: "15.00", currency: "USD" },
    approvals: entry.tasks.map((task) => testApproval(task)),
  });

export const FAKE_STANDARD = aboveBasic({
  key: "fake-standard",
  model: "fake-model-standard",
  tier: "STANDARD",
  tasks: [ESCALATING_TASK.key, NO_ESCALATION_TASK.key, TO_ADVANCED_TASK.key],
});

export const FAKE_ADVANCED = aboveBasic({
  key: "fake-advanced",
  model: "fake-model-advanced",
  tier: "ADVANCED",
  tasks: [ESCALATING_TASK.key, NO_ESCALATION_TASK.key, SKIP_TIER_TASK.key, TO_ADVANCED_TASK.key],
});

const routedAgent = (key: string, taskKey: string, extra: object = {}) =>
  defineAgent({ ...REFERENCE_ROUTED, key, taskKey, prompt: { ...REFERENCE_ROUTED.prompt, key }, ...extra });

export const ESCALATING_AGENT = routedAgent("reference-escalating", ESCALATING_TASK.key);
export const NO_ESCALATION_AGENT = routedAgent("reference-no-escalation", NO_ESCALATION_TASK.key);
export const SKIP_TIER_AGENT = routedAgent("reference-skip-tier", SKIP_TIER_TASK.key);
export const TO_ADVANCED_AGENT = routedAgent("reference-to-advanced", TO_ADVANCED_TASK.key);
/** One model call at most: no room left for an escalated call. */
export const ONE_CALL_AGENT = routedAgent("reference-one-call", ESCALATING_TASK.key, { limits: { maxModelCalls: 1 } });
/** An L2 agent on the escalating task: its proposals can be rejected (009/US4-6). */
export const ESCALATING_L2_AGENT = defineAgent({
  ...REFERENCE_L2,
  key: "reference-escalating-l2",
  taskKey: ESCALATING_TASK.key,
  prompt: { ...REFERENCE_L2.prompt, key: "reference-escalating-l2" },
});

export const ESCALATION_DEFINITIONS = {
  agents: [ESCALATING_AGENT, NO_ESCALATION_AGENT, SKIP_TIER_AGENT, TO_ADVANCED_AGENT, ONE_CALL_AGENT, ESCALATING_L2_AGENT],
  tasks: [ESCALATING_TASK, NO_ESCALATION_TASK, SKIP_TIER_TASK, TO_ADVANCED_TASK],
  modelConfigs: [FAKE_STANDARD, FAKE_ADVANCED],
};
