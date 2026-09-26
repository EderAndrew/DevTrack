import { CurriculumExtractionOutputSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonSchemaOf } from "../../registry/ai-definitions.check";
import { sanitizeJsonSchema } from "./json-schema-sanitize";

const REMOVED = ["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern"];

/** Every key of every object in `value`, recursively (property names included). */
function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, out));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.push(key);
      keysOf(child, out);
    }
  }
  return out;
}

describe("007 research C3 sanitizeJsonSchema", () => {
  it("remove as palavras sem suporte, recursivamente, e mantém required e additionalProperties: false", () => {
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["name", "tags"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200, pattern: "^a" },
        score: { type: "number", minimum: 0, maximum: 10, exclusiveMinimum: 0, exclusiveMaximum: 11, multipleOf: 0.5 },
        tags: { type: "array", minItems: 1, maxItems: 50, items: { type: "string", maxLength: 10 } },
        none: { type: "array", minItems: 0, maxItems: 1, items: { anyOf: [{ type: "string", minLength: 2 }, { type: "null" }] } },
      },
    };
    const sanitized = sanitizeJsonSchema(schema) as typeof schema;

    for (const word of REMOVED) expect(keysOf(sanitized), word).not.toContain(word);
    expect(sanitized).toMatchObject({ type: "object", additionalProperties: false, required: ["name", "tags"] });
    expect(sanitized.properties.tags).toEqual({ type: "array", minItems: 1, items: { type: "string" } });
    expect(sanitized.properties.none).toEqual({ type: "array", minItems: 0, maxItems: 1, items: { anyOf: [{ type: "string" }, { type: "null" }] } });
    expect(schema.properties.name.minLength).toBe(1); // the input is not changed
  });

  it("nomes de propriedade iguais a palavras removidas continuam no esquema", () => {
    const sanitized = sanitizeJsonSchema({
      type: "object",
      required: ["pattern", "minimum"],
      properties: { pattern: { type: "string", pattern: "x" }, minimum: { type: "number", minimum: 1 } },
    }) as { properties: Record<string, object> };
    expect(sanitized.properties).toEqual({ pattern: { type: "string" }, minimum: { type: "number" } });
  });

  it("o esquema de saída da 007 e o de entrada da ferramenta ficam sem nenhuma palavra removida", () => {
    for (const schema of [CurriculumExtractionOutputSchema, z.strictObject({ documentId: z.uuid() })]) {
      const sanitized = sanitizeJsonSchema(jsonSchemaOf(schema));
      for (const word of [...REMOVED, "$schema"]) expect(keysOf(sanitized), word).not.toContain(word);
      expect(JSON.stringify(sanitized)).toContain('"additionalProperties":false');
    }
  });
});
