/** Keywords the structured output and strict tools of the Messages API don't accept (007 research C3). */
const UNSUPPORTED = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
]);

/** Keywords whose value maps names to schemas: the names stay, only the schemas are sanitized. */
const NAMED_SCHEMAS = new Set(["properties", "patternProperties", "$defs", "definitions"]);

/**
 * Strict structured output refuses `oneOf` (Zod writes it for a discriminated union, e.g. the 010
 * generator's exercise types); `anyOf` means the same when a literal tells the variants apart.
 */
const RENAMED: Readonly<Record<string, string>> = { oneOf: "anyOf" };

/** `minItems`/`maxItems` are accepted only as 0 or 1. */
const isArrayBound = (key: string, value: unknown) => (key === "minItems" || key === "maxItems") && value !== 0 && value !== 1;

/**
 * A copy of a JSON Schema without the keywords the API refuses, at any depth, and with `oneOf`
 * as `anyOf`. `required` and `additionalProperties: false` stay; the foundation's Zod validation
 * still enforces every bound removed here (006 FR-039). Pure: the input is not changed.
 */
export function sanitizeJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeJsonSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED.has(key) || isArrayBound(key, value)) continue;
    out[RENAMED[key] ?? key] =
      NAMED_SCHEMAS.has(key) && value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, sanitizeJsonSchema(child)]))
        : sanitizeJsonSchema(value);
  }
  return out;
}
