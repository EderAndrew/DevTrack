import { DocxPackageError, readDocxPackage } from "./docx-package";
import { docxLines } from "./docx-lines";
import { PdfOpenError, withPdf } from "./pdf-document";
import { pdfLines } from "./pdf-lines";
import { matchSection } from "./section-labels";
import type { SourceLine } from "./source-line";
import { GROUP_MARKER, ITEM_MARKER, UnreadableSyllabusError } from "./syllabus-extractor";

/** Bump with any change to the rules below: a proposal records the version it was read with (007). */
export const READER_VERSION = 1;

/** Characters of one block; a longer paragraph is split at a space (007 data-model). */
export const MAX_BLOCK_TEXT = 4000;

export type NormalizedBlockKind = "heading" | "group" | "item" | "text";

/** One block of the normalized document, in document order (007 research C11). */
export interface NormalizedBlock {
  /** `p<page>.<line>` (PDF) or `par<n>` (DOCX) of the block's first line. */
  ref: string;
  kind: NormalizedBlockKind;
  text: string;
}

/**
 * The normalized content of a PDF or DOCX, read by the same readers as extractor version 1.
 * Unlike the extractor, it keeps every line, as written, with where it came from; it never
 * decides what is a syllabus field.
 */
export async function normalizeDocument(bytes: Uint8Array, mediaType: "PDF" | "DOCX"): Promise<NormalizedBlock[]> {
  let lines: SourceLine[];
  try {
    lines = mediaType === "PDF" ? await withPdf(bytes, pdfLines) : docxLines(readDocxPackage(bytes));
  } catch (error) {
    if (error instanceof PdfOpenError || error instanceof DocxPackageError) throw new UnreadableSyllabusError();
    throw error;
  }
  return normalizeLines(lines);
}

/** The DOCX numbering first, then a marker typed in the text, then the emphasis (research E10). */
function kindOf(line: SourceLine): NormalizedBlockKind {
  if (line.list) return line.list;
  if (ITEM_MARKER.test(line.text)) return "item";
  if (GROUP_MARKER.test(line.text)) return "group";
  const section = matchSection(line.text);
  if (line.emphasis || (section && !section.rest)) return "heading";
  return "text";
}

/**
 * Blocks from reader lines (research C11): a PDF line without a marker continues the block above
 * it, by the extractor's `wraps` rule, unless that block is a heading or would pass
 * `MAX_BLOCK_TEXT`. Exported for the unit tests of the rules on lines built in memory.
 */
export function normalizeLines(lines: SourceLine[]): NormalizedBlock[] {
  const blocks: NormalizedBlock[] = [];
  lines.forEach((line, index) => {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) return;
    const kind = kindOf(line);
    const previous = blocks.at(-1);
    if (
      kind === "text" &&
      line.wraps &&
      previous &&
      previous.kind !== "heading" &&
      previous.text.length + 1 + text.length <= MAX_BLOCK_TEXT
    ) {
      previous.text = `${previous.text} ${text}`;
      return;
    }
    const ref = line.ref ?? `l${index + 1}`;
    for (const chunk of split(text)) blocks.push({ ref, kind, text: chunk });
  });
  return blocks;
}

function split(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_BLOCK_TEXT) {
    const cut = rest.lastIndexOf(" ", MAX_BLOCK_TEXT);
    const at = cut > 0 ? cut : MAX_BLOCK_TEXT;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
