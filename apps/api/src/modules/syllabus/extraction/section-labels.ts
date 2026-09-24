/**
 * Section labels recognized by extractor version 1 (research E10), compared without accents,
 * case or a trailing colon. Generic structure of a syllabus in Portuguese and English, never
 * content of a field of knowledge (constitution XXI). Changing them changes what the extractor
 * produces: bump `EXTRACTOR_VERSION` and the golden test together.
 */
export const SECTION_LABELS = {
  syllabus: ["ementa", "syllabus", "description", "descricao"],
  competency: ["competencia", "competencias", "competency", "competencies"],
  objects: [
    "objetos de aprendizagem",
    "objetivos de aprendizagem",
    "conteudo programatico",
    "conteudos",
    "learning objects",
    "learning objectives",
    "contents",
  ],
  /** Sections the extractor skips; they only end the section before them. */
  ignored: [
    "bibliografia",
    "bibliografia basica",
    "bibliografia complementar",
    "referencias",
    "bibliography",
    "references",
    "avaliacao",
    "assessment",
    "metodologia",
    "methodology",
    "carga horaria",
    "pre-requisitos",
    "prerequisites",
  ],
} as const;

export type SectionKind = keyof typeof SECTION_LABELS;

/** Lower case, no accents, single spaces, no trailing colon. */
export function normalizeLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:$/, "");
}

const BY_LABEL = new Map<string, SectionKind>(
  (Object.entries(SECTION_LABELS) as [SectionKind, readonly string[]][]).flatMap(([kind, labels]) =>
    labels.map((label) => [label, kind] as const),
  ),
);

/** Leading numbering of a section heading, e.g. "3. Conteúdo programático" or "II – Ementa". */
const HEADING_NUMBER = /^(?:\d{1,2}|[ivx]{1,4})\s*[.)\-–]?\s+/;

/**
 * The section a line opens, if any, and the text after the label on the same line
 * ("Ementa: Estudo de…"). `null` when the line is not a section heading.
 */
export function matchSection(line: string): { kind: SectionKind; rest: string } | null {
  const normalized = normalizeLabel(line).replace(HEADING_NUMBER, "");
  const whole = BY_LABEL.get(normalized);
  if (whole) return { kind: whole, rest: "" };

  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const kind = BY_LABEL.get(normalizeLabel(line.slice(0, colon)).replace(HEADING_NUMBER, ""));
  return kind ? { kind, rest: line.slice(colon + 1).trim() } : null;
}
