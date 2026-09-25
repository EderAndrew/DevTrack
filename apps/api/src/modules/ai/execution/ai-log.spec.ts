import { describe, expect, it } from "vitest";
import { type AiLogFields, aiLogFields } from "./ai-log";

describe("006/FR-061 campos dos logs de IA", () => {
  it("mantém só os campos da allowlist e descarta o resto", () => {
    const fields = {
      executionId: "e1",
      agentKey: "a",
      status: "FAILED",
      errorCode: "AI_TIMEOUT",
      inputTokens: null,
      prompt: "instruções",
      output: "resposta do modelo",
      input: { text: "conteúdo" },
      apiKey: "sk-x",
    } as AiLogFields;
    expect(aiLogFields(fields)).toEqual({ executionId: "e1", agentKey: "a", status: "FAILED", errorCode: "AI_TIMEOUT", inputTokens: null });
  });
});
