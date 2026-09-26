import { type CurriculumExtractionOutput, CurriculumSourceRefSchema } from "@repo/contracts";
import { norm } from "./grounding";

/**
 * Keeps an item's `sourceRef` only when a block with that ref exists and that block, or that
 * block joined with the next one, contains the item (007/FR-023, research C9). Otherwise the ref
 * becomes `null`: no origin is shown, never an invented one. Returns a new extraction.
 */
export function filterSourceRefs(
  extraction: CurriculumExtractionOutput,
  blocks: readonly { ref: string; text: string }[],
): CurriculumExtractionOutput {
  const windows = new Map<string, string[]>();
  blocks.forEach((block, index) => {
    const next = blocks[index + 1];
    const window = ` ${norm(block.text)}${next ? ` ${norm(next.text)}` : ""} `;
    windows.set(block.ref, [...(windows.get(block.ref) ?? []), window]);
  });
  const keep = (ref: string | null, text: string): string | null => {
    if (ref === null || !CurriculumSourceRefSchema.safeParse(ref).success) return null;
    const normalized = norm(text);
    const found = normalized !== "" && (windows.get(ref) ?? []).some((window) => window.includes(` ${normalized} `));
    return found ? ref : null;
  };
  return {
    ...extraction,
    groups: extraction.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, sourceRef: keep(item.sourceRef, item.text) })),
    })),
  };
}

export type SourceLocation = { kind: "page"; n: number } | { kind: "paragraph"; n: number };

/** `p3.12` → page 3; `par41` → paragraph 41; anything else → `null` (research C9, "Display"). */
export function formatSourceRef(ref: string): SourceLocation | null {
  const page = /^p(\d+)\.\d+$/.exec(ref);
  if (page) return { kind: "page", n: Number(page[1]) };
  const paragraph = /^par(\d+)$/.exec(ref);
  return paragraph ? { kind: "paragraph", n: Number(paragraph[1]) } : null;
}
