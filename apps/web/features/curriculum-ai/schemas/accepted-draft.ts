import { type CurriculumExtractionOutput, type SaveSyllabusRevisionRequest, SaveSyllabusRevisionRequestSchema } from "@repo/contracts";

const FIELDS = ["title", "syllabusText", "competencyText"] as const;

/**
 * The draft the API would write for the accepted items (007 data-model invariant 3): a field not
 * accepted is null, a group not accepted is left out and the others keep their order.
 * `groupIds[i]` is the item id of the draft's group `i`.
 */
export function acceptedDraft(
  extraction: CurriculumExtractionOutput,
  accepted: ReadonlySet<string>,
): { body: SaveSyllabusRevisionRequest; groupIds: string[] } {
  const groupIds = extraction.groups.map((_, index) => `group:${index}`).filter((id) => accepted.has(id));
  const field = (name: (typeof FIELDS)[number]) => (accepted.has(name) ? extraction[name] : null);
  return {
    body: {
      title: field("title"),
      syllabusText: field("syllabusText"),
      competencyText: field("competencyText"),
      groups: groupIds.map((id) => {
        const group = extraction.groups[Number(id.slice("group:".length))]!;
        return { title: group.title, items: group.items.map((item) => ({ text: item.text })) };
      }),
    },
    groupIds,
  };
}

/**
 * The first accepted item the 004 draft would refuse (007/US3-8), checked with the same schema as
 * the API, or null when the selection can be applied. A limit on all the groups points to the first one.
 */
export function firstInvalidItem(extraction: CurriculumExtractionOutput, accepted: ReadonlySet<string>): string | null {
  const { body, groupIds } = acceptedDraft(extraction, accepted);
  const result = SaveSyllabusRevisionRequestSchema.safeParse(body);
  if (result.success) return null;
  const [head, index] = result.error.issues[0]?.path ?? [];
  if (typeof head === "string" && (FIELDS as readonly string[]).includes(head)) return head;
  return (typeof index === "number" ? groupIds[index] : groupIds[0]) ?? null;
}
