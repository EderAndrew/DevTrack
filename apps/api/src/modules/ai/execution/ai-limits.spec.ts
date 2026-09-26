import { describe, expect, it } from "vitest";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import { effectiveLimits } from "./ai-limits";

const GLOBAL: AiExecutionLimits = {
  totalTimeoutMs: 120_000,
  modelCallTimeoutMs: 60_000,
  toolTimeoutMs: 10_000,
  maxModelCalls: 5,
  maxToolCalls: 10,
  maxRetries: 2,
  maxInputBytes: 204_800,
  maxOutputBytes: 204_800,
};

describe("006/FR-048 limites efetivos = min(global, agente)", () => {
  it("sem limites próprios, valem os globais", () => {
    expect(effectiveLimits(GLOBAL, {})).toEqual(GLOBAL);
  });

  it("um limite menor do agente vale; os demais seguem globais", () => {
    expect(effectiveLimits(GLOBAL, { limits: { maxModelCalls: 2, maxInputBytes: 1_000 } })).toEqual({ ...GLOBAL, maxModelCalls: 2, maxInputBytes: 1_000 });
  });

  it("um limite maior nunca aumenta o global (a sincronização o recusa antes)", () => {
    expect(effectiveLimits(GLOBAL, { limits: { maxToolCalls: 99, totalTimeoutMs: 999_999 } })).toEqual(GLOBAL);
  });
});
