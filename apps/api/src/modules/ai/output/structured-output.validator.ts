import { Injectable } from "@nestjs/common";
import type { AiErrorCode } from "@repo/contracts";
import type { z } from "zod";

/** Where the output failed the schema: paths and issue codes only, never values (FR-061). */
export interface OutputIssue {
  path: string;
  code: string;
}

export type OutputValidation =
  | { ok: true; output: unknown }
  | { ok: false; code: Extract<AiErrorCode, "AI_OUTPUT_PARSE_FAILED" | "AI_OUTPUT_VALIDATION_FAILED" | "AI_EXECUTION_LIMIT_EXCEEDED">; issues: OutputIssue[] };

/**
 * A model answer becomes a result only here (006 FR-039, FR-040, research A18): empty → invalid,
 * above the size limit → limit exceeded, not JSON → parse failed, outside the agent's schema →
 * invalid. A provider's success is never enough, and malformed JSON is never "repaired".
 */
@Injectable()
export class StructuredOutputValidator {
  validate(text: string, schema: z.ZodType, maxBytes: number): OutputValidation {
    if (text.trim() === "") return { ok: false, code: "AI_OUTPUT_VALIDATION_FAILED", issues: [] };
    if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, code: "AI_EXECUTION_LIMIT_EXCEEDED", issues: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, code: "AI_OUTPUT_PARSE_FAILED", issues: [] };
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        code: "AI_OUTPUT_VALIDATION_FAILED",
        issues: result.error.issues.map((issue) => ({ path: issue.path.join(".") || "(root)", code: issue.code })),
      };
    }
    return { ok: true, output: result.data };
  }
}
