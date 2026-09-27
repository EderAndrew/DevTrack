import type { ModelCapabilities } from "../../../src/modules/ai/definitions/model-families";
import { type CatalogModel, defineCatalogModel } from "../../../src/modules/ai/definitions/types";
import { approvedTaskKeys } from "./tasks";

/**
 * The test catalog (006 T015, 009 T014): three models on the fake provider, family `fake` (never in
 * production), BASIC, generation, PRODUCTION. With the tasks' `typicalUsage` zeroed the cost ties,
 * so `priority` decides: `fake-default` first, then `fake-alt`, then `fake-no-price` (no price comes
 * last anyway). Each is approved for the tasks `routedTask` names it in.
 */
const CAPABILITIES: ModelCapabilities = { structuredOutput: true, tools: true, vision: false, reasoning: false };

const fakeModel = (entry: Omit<CatalogModel, "provider" | "family" | "tier" | "mode" | "lifecycle" | "initialStatus" | "contextWindow" | "capabilities">) =>
  defineCatalogModel({
    provider: "fake",
    family: "fake",
    tier: "BASIC",
    mode: "GENERATION",
    lifecycle: "PRODUCTION",
    initialStatus: "ENABLED",
    contextWindow: 100_000,
    capabilities: CAPABILITIES,
    ...entry,
  });

/** An approval meeting any reference task's thresholds (`schemaValidity: 1`). */
export const testApproval = (taskKey: string, metrics: Record<string, number> = { schemaValidity: 1 }) => ({
  taskKey,
  metrics,
  evaluatedAt: "2026-09-27T00:00:00.000Z",
  evidence: "apps/api/test/fixtures/ai/model-configs.ts",
});

const approvalsOf = (modelKey: string) => approvedTaskKeys(modelKey).map((taskKey) => testApproval(taskKey));

export const FAKE_DEFAULT = fakeModel({
  key: "fake-default",
  model: "fake-model-1",
  parameters: { temperature: 0 },
  maxOutputTokens: 2000,
  timeoutMs: 30_000,
  price: { inputPerMTok: "1.00", outputPerMTok: "2.00", currency: "USD" },
  priority: 2,
});

export const FAKE_ALT = fakeModel({
  key: "fake-alt",
  model: "fake-model-2",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
  price: { inputPerMTok: "0.50", outputPerMTok: "1.50", currency: "USD" },
  priority: 1,
});

export const FAKE_NO_PRICE = fakeModel({
  key: "fake-no-price",
  model: "fake-model-3",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
});

/** The catalog with the approvals registered so far (read when an app is created, after the suites' `routedTask`). */
export function referenceCatalog(): CatalogModel[] {
  return [FAKE_DEFAULT, FAKE_ALT, FAKE_NO_PRICE].map((entry) => ({ ...entry, approvals: approvalsOf(entry.key) }));
}
