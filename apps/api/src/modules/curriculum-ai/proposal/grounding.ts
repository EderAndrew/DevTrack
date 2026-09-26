import type { CurriculumExtractionOutput, CurriculumUnsupported } from "@repo/contracts";

/** A list marker at the start of a text: "1.", "a)", "-", "•" (research C8, step 4). */
const LEADING_MARKER = /^\s*(\d+[.)]|[a-z][.)]|[-–•*·])\s+/u;

/**
 * Normalization of the grounding check (research C8): NFKC, lowercase, no diacritics, no leading
 * list marker, and every run of other characters as one space. It absorbs line wraps, bullets,
 * accents, case and punctuation, and nothing else.
 */
export function norm(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(LEADING_MARKER, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The whole document as one normalized stream, padded so whole-word matches can be checked. */
export function documentStream(blocks: readonly { text: string }[]): string {
  return ` ${blocks.map((block) => norm(block.text)).join(" ")} `;
}

/**
 * A text is supported when its normalized form appears in the normalized stream, as whole words
 * (so "java" is not supported by "javascript"). A text with nothing left after normalization has
 * no support.
 */
export function isSupported(text: string, stream: string): boolean {
  const normalized = norm(text);
  return normalized !== "" && stream.includes(` ${normalized} `);
}

/**
 * Deterministic grounding check (007/FR-021, research C8): every field, group title and item the
 * model proposed, against the document's own text. It only reports: nothing is removed or
 * approved here, and the teacher sees `UNSUPPORTED_CONTENT` next to what is listed.
 */
export function checkGrounding(
  extraction: CurriculumExtractionOutput,
  blocks: readonly { text: string }[],
): { unsupported: CurriculumUnsupported[] } {
  const stream = documentStream(blocks);
  const unsupported: CurriculumUnsupported[] = [];
  for (const field of ["title", "syllabusText", "competencyText"] as const) {
    const value = extraction[field];
    if (value !== null && !isSupported(value, stream)) unsupported.push({ field, groupIndex: null, itemIndex: null });
  }
  extraction.groups.forEach((group, groupIndex) => {
    if (group.title !== null && !isSupported(group.title, stream)) {
      unsupported.push({ field: "groupTitle", groupIndex, itemIndex: null });
    }
    group.items.forEach((item, itemIndex) => {
      if (!isSupported(item.text, stream)) unsupported.push({ field: "item", groupIndex, itemIndex });
    });
  });
  return { unsupported };
}
