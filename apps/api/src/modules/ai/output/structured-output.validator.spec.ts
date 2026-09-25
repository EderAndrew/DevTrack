import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StructuredOutputValidator } from "./structured-output.validator";

const SCHEMA = z.strictObject({ summary: z.string().min(1), score: z.number().optional() });
const validator = new StructuredOutputValidator();

describe("006/FR-039 006/FR-040 validação da saída estruturada", () => {
  it("saída válida pelo esquema → resultado", () => {
    expect(validator.validate('{"summary":"ok"}', SCHEMA, 1_000)).toEqual({ ok: true, output: { summary: "ok" } });
  });

  it.each(["", "   \n "])("vazia (%j) → AI_OUTPUT_VALIDATION_FAILED", (text) => {
    expect(validator.validate(text, SCHEMA, 1_000)).toMatchObject({ ok: false, code: "AI_OUTPUT_VALIDATION_FAILED" });
  });

  it("acima do tamanho máximo → AI_EXECUTION_LIMIT_EXCEEDED, antes de interpretar", () => {
    expect(validator.validate(JSON.stringify({ summary: "x".repeat(2_000) }), SCHEMA, 1_000)).toMatchObject({
      ok: false,
      code: "AI_EXECUTION_LIMIT_EXCEEDED",
    });
  });

  it.each(["texto livre", '{"summary": "truncado"', "```json\n{}\n```"])("não interpretável (%j) → AI_OUTPUT_PARSE_FAILED", (text) => {
    expect(validator.validate(text, SCHEMA, 1_000)).toMatchObject({ ok: false, code: "AI_OUTPUT_PARSE_FAILED" });
  });

  it.each([
    ["campo obrigatório ausente", "{}"],
    ["tipo errado", '{"summary": 1}'],
    ["campo a mais", '{"summary": "x", "extra": true}'],
    ["null", "null"],
  ])("%s → AI_OUTPUT_VALIDATION_FAILED, com os caminhos e sem os valores", (_name, text) => {
    const result = validator.validate(text, SCHEMA, 1_000);
    expect(result).toMatchObject({ ok: false, code: "AI_OUTPUT_VALIDATION_FAILED" });
    if (!result.ok) expect(JSON.stringify(result.issues)).not.toContain('"x"');
  });

  it("o tamanho conta bytes, não caracteres", () => {
    const text = JSON.stringify({ summary: "é".repeat(400) });
    expect(validator.validate(text, SCHEMA, 500)).toMatchObject({ ok: false, code: "AI_EXECUTION_LIMIT_EXCEEDED" });
  });
});
