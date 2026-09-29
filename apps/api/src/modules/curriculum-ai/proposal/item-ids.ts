import type { CurriculumExtractionOutput, SaveSyllabusRevisionRequest } from "@repo/contracts";

const FIELDS = ["title", "syllabusText", "competencyText"] as const;

/**
 * The items a teacher accepts or not (007 data-model): each identified field, the language when
 * one is proposed (010/FR-041), then `group:<i>` for each group, in document order. Empty when
 * nothing was identified (FR-017).
 */
export function itemIdsOf(extraction: CurriculumExtractionOutput, hasLanguage = false): string[] {
  return [
    ...FIELDS.filter((field) => extraction[field] !== null),
    ...(hasLanguage ? ["language"] : []),
    ...extraction.groups.map((_, index) => `group:${index}`),
  ];
}

/**
 * The draft content of the accepted items (data-model invariant 3): a field not accepted is
 * `null`, a group not accepted is left out, and the others keep their order.
 */
export function projectAccepted(
  extraction: CurriculumExtractionOutput,
  acceptedItemIds: readonly string[],
): SaveSyllabusRevisionRequest {
  const accepted = new Set(acceptedItemIds);
  const field = (name: (typeof FIELDS)[number]) => (accepted.has(name) ? extraction[name] : null);
  return {
    title: field("title"),
    syllabusText: field("syllabusText"),
    competencyText: field("competencyText"),
    groups: extraction.groups
      .filter((_, index) => accepted.has(`group:${index}`))
      .map((group) => ({ title: group.title, items: group.items.map((item) => ({ text: item.text })) })),
  };
}
