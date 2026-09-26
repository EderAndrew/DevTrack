import type { CurriculumSourceRef } from "@repo/contracts";

/** "página 3" for `p3.12` (PDF), "parágrafo 41" for `par41` (DOCX); null for anything else. */
export function sourceRefLabel(ref: CurriculumSourceRef): string | null {
  const page = /^p(\d+)\.\d+$/.exec(ref);
  if (page) return `página ${page[1]}`;
  const paragraph = /^par(\d+)$/.exec(ref);
  return paragraph ? `parágrafo ${paragraph[1]}` : null;
}

/** Where in the document an item came from (007/FR-025), so the teacher can check it against the original. */
export function SourceRef({ sourceRef }: { sourceRef: CurriculumSourceRef }) {
  const label = sourceRefLabel(sourceRef);
  if (!label) return null;
  return <span className="text-body-sm text-text-secondary">(origem: {label})</span>;
}
