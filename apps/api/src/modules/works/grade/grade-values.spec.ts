import { describe, expect, it } from "vitest";
import { withValues } from "./grade-values";

describe("011 valores das questões por posição (research W4)", () => {
  it("011/US2-3 0,50 em 3 questões → 0,17, 0,17 e 0,16, na ordem dada", () => {
    expect(withValues(50, ["a", "b", "c"].map((id) => ({ id })))).toEqual([
      { id: "a", valueCents: 17 },
      { id: "b", valueCents: 17 },
      { id: "c", valueCents: 16 },
    ]);
  });

  it("reordenar muda quem leva o resto; somar sempre dá o total", () => {
    const reordered = withValues(100, ["c", "a", "b"].map((id) => ({ id })));
    expect(reordered.map((q) => q.valueCents)).toEqual([34, 33, 33]);
    expect(reordered.reduce((sum, q) => sum + q.valueCents, 0)).toBe(100);
  });
});
