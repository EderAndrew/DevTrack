import { describe, expect, it } from "vitest";
import { backoffMs, isTransient } from "./retry-policy";

describe("006/FR-049 política de novas tentativas", () => {
  it("só indisponibilidade, limite de taxa e tempo esgotado são transitórios", () => {
    expect(isTransient("UNAVAILABLE")).toBe(true);
    expect(isTransient("RATE_LIMITED")).toBe(true);
    expect(isTransient("TIMEOUT")).toBe(true);
    expect(isTransient("INVALID_REQUEST")).toBe(false);
    expect(isTransient("AUTH")).toBe(false);
    expect(isTransient("UNKNOWN")).toBe(false);
  });

  it("espera crescente 500 ms · 2^n com jitter de até 20%", () => {
    expect(backoffMs(0, () => 0)).toBe(500);
    expect(backoffMs(1, () => 0)).toBe(1000);
    expect(backoffMs(2, () => 0)).toBe(2000);
    expect(backoffMs(1, () => 0.999)).toBeLessThanOrEqual(1200);
    expect(backoffMs(1, () => 0.999)).toBeGreaterThan(1000);
  });
});
