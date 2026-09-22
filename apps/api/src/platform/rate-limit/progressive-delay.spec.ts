import { describe, expect, it } from "vitest";
import { progressiveDelayMs } from "./rate-limit.service";

describe("progressiveDelayMs (R8)", () => {
  it.each([
    [0, 0],
    [4, 0],
    [5, 250],
    [6, 500],
    [7, 1_000],
    [9, 4_000],
    [10, 8_000],
    [11, 8_000],
    [50, 8_000],
  ])("%i failures → %i ms", (failures, delay) => {
    expect(progressiveDelayMs(failures)).toBe(delay);
  });
});
