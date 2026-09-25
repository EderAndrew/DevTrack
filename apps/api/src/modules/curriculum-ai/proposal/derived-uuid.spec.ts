import { UuidSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { derivedUuid } from "./derived-uuid";

describe("007 derivedUuid (research C13)", () => {
  it("é determinístico: o mesmo nome dá o mesmo id, e nomes diferentes, ids diferentes", () => {
    const name = "curriculum-ai:3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11:1";
    expect(derivedUuid(name)).toBe(derivedUuid(name));
    expect(derivedUuid(name)).not.toBe(derivedUuid(`${name}0`));
  });

  it("tem o formato de UUID versão 5, variante RFC", () => {
    for (const name of ["", "a", "curriculum-ai:x:1", "ç".repeat(1000)]) {
      const id = derivedUuid(name);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(UuidSchema.safeParse(id).success).toBe(true);
    }
  });
});
