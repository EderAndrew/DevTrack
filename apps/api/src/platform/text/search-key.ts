/**
 * Accent- and case-insensitive search key (FR-007, D10): the parts joined by a space, NFD
 * decomposed without combining marks, lowercased, whitespace collapsed. Stored by the
 * application because `unaccent` is not IMMUTABLE and cannot back an index.
 */
export function searchKey(...parts: string[]): string {
  return parts
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
