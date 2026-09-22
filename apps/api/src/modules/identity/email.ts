/**
 * Canonical form of an e-mail address (FR-001): no surrounding whitespace, case-insensitive.
 * `emailSchema` applies the same rule to request bodies; use this for other inputs (CLI).
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
