import { describe, expect, it } from "vitest";
import { searchKey } from "./search-key";

describe("searchKey (003/FR-007)", () => {
  it('"Programação" and "programacao" produce the same key', () => {
    expect(searchKey("Programação")).toBe(searchKey("programacao"));
    expect(searchKey("Programação")).toBe("programacao");
  });

  it("joins name and code, keeping hyphens and collapsing whitespace", () => {
    expect(searchKey("  Lógica   de\tProgramação ", "LP-2026.A")).toBe("logica de programacao lp-2026.a");
  });

  it("is idempotent", () => {
    const once = searchKey("Introdução à Computação", "IC_01");
    expect(searchKey(once)).toBe(once);
  });
});
