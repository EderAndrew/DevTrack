import { describe, expect, it } from "vitest";
import { normalizeRa } from "./ra";

describe("normalizeRa (003/FR-041)", () => {
  it("trims and uppercases", () => {
    expect(normalizeRa(" 2026a-01 ")).toBe("2026A-01");
  });

  it("is idempotent", () => {
    const once = normalizeRa(" ra.2026/b ");
    expect(normalizeRa(once)).toBe(once);
  });
});
