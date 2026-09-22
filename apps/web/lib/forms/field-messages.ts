import type { z } from "zod";
import { ERROR_MESSAGES } from "../messages/error-messages";

/** Same text the API sends for VALIDATION_ERROR, now shown on the field before sending (002 S9). */
export const INVALID_DATA = ERROR_MESSAGES.VALIDATION_ERROR;

/**
 * Zod error map for a form (002 S9): an empty field gets its own text ("Informe seu e-mail."),
 * any other violation of the contract gets "Dados inválidos.". Messages set on the schema itself
 * (password length hint, confirmation) take precedence over this map.
 */
export function fieldMessages(empty: Readonly<Record<string, string>>): z.core.$ZodErrorMap {
  return (issue) => {
    const field = String(issue.path?.[0] ?? "");
    const input = issue.input;
    const isEmpty = input === undefined || input === null || (typeof input === "string" && input.trim() === "");
    return (isEmpty ? empty[field] : undefined) ?? INVALID_DATA;
  };
}
