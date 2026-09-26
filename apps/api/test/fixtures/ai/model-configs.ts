import { defineModelConfig } from "../../../src/modules/ai/definitions/types";

/** Model configs of the tests, all on the fake provider (006 T015). */
export const FAKE_DEFAULT = defineModelConfig({
  key: "fake-default",
  provider: "fake",
  model: "fake-model-1",
  initialStatus: "ENABLED",
  parameters: { temperature: 0 },
  maxOutputTokens: 2000,
  timeoutMs: 30_000,
  price: { inputPerMTok: "1.00", outputPerMTok: "2.00", currency: "USD" },
});

export const FAKE_ALT = defineModelConfig({
  key: "fake-alt",
  provider: "fake",
  model: "fake-model-2",
  initialStatus: "ENABLED",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
  price: { inputPerMTok: "0.50", outputPerMTok: "1.50", currency: "USD" },
});

export const FAKE_NO_PRICE = defineModelConfig({
  key: "fake-no-price",
  provider: "fake",
  model: "fake-model-3",
  initialStatus: "ENABLED",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
});

export const REFERENCE_MODEL_CONFIGS = [FAKE_DEFAULT, FAKE_ALT, FAKE_NO_PRICE];
