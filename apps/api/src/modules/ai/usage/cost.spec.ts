import { describe, expect, it } from "vitest";
import { estimateCost } from "./cost";

const PRICE = { inputPerMTok: "1.00", outputPerMTok: "2.00", currency: "USD" };

describe("006/FR-059 custo estimado", () => {
  it("(entrada × preço + saída × preço) / 1 000 000", () => {
    expect(estimateCost({ inputTokens: 120, outputTokens: 30, totalTokens: 150 }, PRICE)).toEqual({ amount: "0.00018", currency: "USD" });
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: null }, PRICE)).toEqual({ amount: "2", currency: "USD" });
    expect(estimateCost({ inputTokens: 3, outputTokens: 0, totalTokens: 3 }, { ...PRICE, inputPerMTok: "0.123456" })).toEqual({
      amount: "0",
      currency: "USD",
    });
  });

  it("sem uso informado pelo provedor → nulo (nunca estima tokens)", () => {
    expect(estimateCost(null, PRICE)).toBeNull();
    expect(estimateCost({ inputTokens: null, outputTokens: 10, totalTokens: null }, PRICE)).toBeNull();
  });

  it("sem preço configurado → nulo", () => {
    expect(estimateCost({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }, null)).toBeNull();
  });
});
