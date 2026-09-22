import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail (FR-001)", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Maria.Silva@Escola.EDU.br \t")).toBe("maria.silva@escola.edu.br");
  });

  it("is idempotent", () => {
    const once = normalizeEmail(" A@B.C ");
    expect(normalizeEmail(once)).toBe(once);
  });
});
