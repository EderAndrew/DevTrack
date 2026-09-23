/**
 * Canonical form of a student's RA (FR-041, D2): no surrounding whitespace, uppercase. The
 * unique index compares `upper(ra)`, so equal RAs in different case are the same RA.
 */
export function normalizeRa(value: string): string {
  return value.trim().toUpperCase();
}
