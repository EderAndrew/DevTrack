import { defineCatalogModel, defineTask } from "../../../src/modules/ai/definitions/types";
import { testApproval } from "./model-configs";

/**
 * Decision mode in the tests (009 research H10): no production task decides yet (spec Q2), so a
 * reference task and a fake decision model stand in for Jev. Suites register them with
 * `createAiTestApp({ modelConfigs: [FAKE_DECISION], tasks: [REFERENCE_DECISION_TASK] })`.
 */
export const REFERENCE_DECISION_TASK = defineTask({
  key: "reference-decision",
  mode: "DECISION",
  minimumTier: "BASIC",
  preferredTier: "BASIC",
  allowedFamilies: ["fake"],
  requiredCapabilities: [],
  fallback: "NONE",
  escalation: "NONE",
  quality: { accuracy: 0.9 },
  typicalUsage: { inputTokens: 0, outputTokens: 0 },
  minConfidence: 0.7,
  maxOutputTokens: 100,
  timeoutMs: 10_000,
});

export const FAKE_DECISION = defineCatalogModel({
  key: "fake-decision",
  provider: "fake",
  family: "fake",
  model: "fake-decision-1",
  tier: "BASIC",
  mode: "DECISION",
  lifecycle: "PRODUCTION",
  initialStatus: "ENABLED",
  contextWindow: 64_000,
  capabilities: { structuredOutput: false, tools: false, vision: false, reasoning: false },
  maxOutputTokens: 100,
  timeoutMs: 10_000,
  approvals: [testApproval(REFERENCE_DECISION_TASK.key, { accuracy: 1 })],
});
