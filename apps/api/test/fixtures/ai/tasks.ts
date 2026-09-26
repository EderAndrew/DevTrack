import { defineTask } from "../../../src/modules/ai/definitions/types";

/**
 * Tasks of the reference agents (008 research G2), with the settings the fake configs had, so the
 * 006 behavior stays the same. No fallback: the 008 suites add their own routes.
 */
export const REFERENCE_DEFAULT_TASK = defineTask({
  key: "reference-default",
  primaryModelConfigKey: "fake-default",
  parameters: { temperature: 0 },
  maxOutputTokens: 2000,
  timeoutMs: 30_000,
});

export const REFERENCE_ALT_TASK = defineTask({
  key: "reference-alt",
  primaryModelConfigKey: "fake-alt",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
});

export const REFERENCE_TASKS = [REFERENCE_DEFAULT_TASK, REFERENCE_ALT_TASK];
