import {
  type SyllabusExtraction,
  type SyllabusExtractionResult,
  SyllabusExtractionSchema,
  type SyllabusMediaType,
} from "@repo/contracts";
import { DocxPackageError, readDocxPackage } from "./docx-package";
import { docxLines } from "./docx-lines";
import { PdfOpenError, withPdf } from "./pdf-document";
import { pdfLines } from "./pdf-lines";
import { matchSection, type SectionKind } from "./section-labels";
import type { SourceLine } from "./source-line";

/** Bump with any change to the rules below, together with the golden test (004/SC-005). */
export const EXTRACTOR_VERSION = 1;

/** Fewer non-blank characters than this in the whole document → `NO_TEXT` (a scanned PDF). */
const MIN_TEXT_CHARS = 20;

export interface ExtractionOutcome {
  result: SyllabusExtractionResult;
  extraction: SyllabusExtraction;
}

/** The file cannot be read at all: a permanent failure (`UNREADABLE`), never retried. */
export class UnreadableSyllabusError extends Error {
  override readonly name = "UnreadableSyllabusError";
}

const EMPTY: SyllabusExtraction = {
  extractorVersion: EXTRACTOR_VERSION,
  title: null,
  syllabusText: null,
  competencyText: null,
  groups: [],
};

/**
 * Extractor version 1 (research E10): deterministic, no AI and no OCR — images are always
 * `NO_TEXT` (004/FR-020). The same bytes always produce the same JSON.
 */
export async function extractSyllabus(bytes: Uint8Array, mediaType: SyllabusMediaType): Promise<ExtractionOutcome> {
  if (mediaType === "PNG" || mediaType === "JPEG") return { result: "NO_TEXT", extraction: { ...EMPTY } };

  let lines: SourceLine[];
  try {
    lines = mediaType === "PDF" ? await withPdf(bytes, pdfLines) : docxLines(readDocxPackage(bytes));
  } catch (error) {
    if (error instanceof PdfOpenError || error instanceof DocxPackageError) throw new UnreadableSyllabusError();
    throw error;
  }

  const characters = lines.reduce((sum, line) => sum + line.text.replace(/\s/g, "").length, 0);
  if (characters < MIN_TEXT_CHARS) return { result: "NO_TEXT", extraction: { ...EMPTY } };
  return { result: "TEXT", extraction: SyllabusExtractionSchema.parse(structureSyllabus(lines)) };
}

/** "1.", "1)", "I.", "A." — opens a group. */
const GROUP_MARKER = /^(?:\d{1,3}[.)]|[IVXLC]{1,6}[.)]|[A-Z][.)])\s+(?=\S)/;
/** "-", "•", "a)", "1.1" — an item of the current group. */
const ITEM_MARKER = /^(?:[-•▪◦*–—·●○■□►]|[a-z][.)]|\d{1,3}(?:\.\d{1,3})+[.)]?)\s+(?=\S)/;

type Kind = "group" | "item" | "plain";

function classify(line: SourceLine): { kind: Kind; text: string } {
  // Word numbering is not part of the text, but a typed marker may still be there.
  const item = ITEM_MARKER.exec(line.text);
  const group = item ? null : GROUP_MARKER.exec(line.text);
  const text = line.text.slice((item ?? group)?.[0].length ?? 0).trim();
  if (line.list) return { kind: line.list, text };
  if (item) return { kind: "item", text };
  if (group || line.emphasis) return { kind: "group", text };
  return { kind: "plain", text };
}

interface Group {
  title: string | null;
  items: string[];
}

/**
 * Groups and items of a list (research E10, step 3). `listsOnly` (no learning-objects section):
 * only marked lines and the lines that wrap them count; any other text is skipped.
 */
function buildGroups(lines: SourceLine[], listsOnly: boolean): Group[] {
  const groups: Group[] = [];
  let last: { group: Group; item: number | null } | null = null;
  let previousKept = false;

  const addItem = (text: string) => {
    let group = groups.at(-1);
    if (!group) groups.push((group = { title: null, items: [] }));
    group.items.push(text);
    last = { group, item: group.items.length - 1 };
  };

  for (const line of lines) {
    const { kind, text } = classify(line);
    if (!text) continue;
    if (listsOnly && kind === "group" && !line.list && !GROUP_MARKER.test(line.text)) {
      // Outside a learning-objects section, a bold line is just text, not a group.
      previousKept = false;
      continue;
    }
    if (kind === "group") {
      const group: Group = { title: text, items: [] };
      groups.push(group);
      last = { group, item: null };
      previousKept = true;
    } else if (kind === "item") {
      addItem(text);
      previousKept = true;
    } else if (line.wraps && last && (!listsOnly || previousKept)) {
      const target: { group: Group; item: number | null } = last;
      if (target.item === null) target.group.title = `${target.group.title ?? ""} ${text}`.trim();
      else target.group.items[target.item] = `${target.group.items[target.item]} ${text}`;
    } else if (!listsOnly) {
      addItem(text);
      previousKept = true;
    } else {
      previousKept = false;
    }
  }

  // A plain numbered list ("1. A", "2. B") has only first-level markers: its entries are items.
  if (groups.length > 0 && groups.every((group) => group.items.length === 0)) {
    return [{ title: null, items: groups.map((group) => group.title!) }];
  }
  return groups;
}

/**
 * Sections, title, groups and items (research E10, steps 2–4). Exported for the unit tests of
 * the rules on lines built in memory.
 */
export function structureSyllabus(lines: SourceLine[]): SyllabusExtraction {
  let title: string | null = null;
  let current: SectionKind | "preamble" = "preamble";
  const sections: Record<"syllabus" | "competency" | "objects", SourceLine[] | null> = {
    syllabus: null,
    competency: null,
    objects: null,
  };
  const loose: SourceLine[] = [];

  for (const line of lines) {
    const section = matchSection(line.text);
    if (section) {
      current = section.kind;
      if (current !== "ignored") sections[current] ??= [];
      if (section.rest && current !== "ignored") sections[current]!.push({ ...line, text: section.rest, emphasis: false });
      continue;
    }
    if (current === "preamble" && title === null) {
      title = line.text;
      continue;
    }
    if (current === "preamble" || current === "ignored") loose.push(line);
    else sections[current]!.push(line);
  }

  return {
    extractorVersion: EXTRACTOR_VERSION,
    title,
    syllabusText: joinText(sections.syllabus),
    competencyText: joinText(sections.competency),
    groups: sections.objects ? buildGroups(sections.objects, false) : buildGroups(loose, true),
  };
}

/** Wrapped PDF lines join with a space; DOCX paragraphs keep their breaks. */
function joinText(lines: SourceLine[] | null): string | null {
  if (!lines || lines.length === 0) return null;
  let text = "";
  for (const line of lines) text += text ? (line.wraps ? " " : "\n") + line.text : line.text;
  return text.trim() || null;
}
