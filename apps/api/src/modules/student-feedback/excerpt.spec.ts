import { FEEDBACK_EXCERPT_LENGTH } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { EXCERPT_LENGTH, excerpt } from "./excerpt";

describe("020/FR-008 trecho da mensagem na lista do ADMIN (contracts/http-api.md)", () => {
  it("020/FR-008 o tamanho do trecho é o do contrato", () => {
    expect(EXCERPT_LENGTH).toBe(FEEDBACK_EXCERPT_LENGTH);
  });

  it("020/FR-008 uma mensagem de até 140 code points volta inteira", () => {
    expect(excerpt("Uma sugestão curta.")).toBe("Uma sugestão curta.");
    expect(excerpt("a".repeat(140))).toBe("a".repeat(140));
  });

  it("020/FR-008 uma mensagem maior é cortada nos 140 primeiros code points", () => {
    expect(excerpt("a".repeat(141))).toBe("a".repeat(140));
    expect(excerpt("ç".repeat(2000))).toBe("ç".repeat(140));
  });

  it("020/FR-008 o corte nunca parte um emoji (par substituto)", () => {
    const cut = excerpt(`${"a".repeat(139)}😀😀`);
    expect(cut).toBe(`${"a".repeat(139)}😀`);
    expect([...excerpt("😀".repeat(200))]).toHaveLength(140);
    expect(excerpt("😀".repeat(200))).toBe("😀".repeat(140));
  });
});
