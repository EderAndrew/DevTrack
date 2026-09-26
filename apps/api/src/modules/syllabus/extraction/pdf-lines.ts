import type { PdfDocument } from "./pdf-document";
import type { SourceLine } from "./source-line";

/** Text items whose baselines differ by at most this many points are on the same line (E10). */
const SAME_LINE_TOLERANCE = 2;

interface Piece {
  text: string;
  x: number;
  y: number;
  width: number;
  bold: boolean;
}

/** Lines of every page, top to bottom, each with its items left to right (research E10). */
export async function pdfLines(document: PdfDocument): Promise<SourceLine[]> {
  const lines: SourceLine[] = [];
  for (let number = 1; number <= document.numPages; number++) {
    const page = await document.getPage(number);
    // Resolves the page's fonts, so their names (and weight) can be read below.
    await page.getOperatorList();
    const content = await page.getTextContent();
    const bold = new Map<string, boolean>();
    const isBold = (fontName: string) => {
      if (!bold.has(fontName)) bold.set(fontName, fontIsBold(page.commonObjs, fontName));
      return bold.get(fontName)!;
    };

    const pieces: Piece[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.trim() === "") continue;
      pieces.push({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, bold: isBold(item.fontName) });
    }
    lines.push(...groupLines(pieces).map((line, index) => ({ ...line, ref: `p${number}.${index + 1}` })));
    page.cleanup();
  }
  return lines;
}

function groupLines(pieces: Piece[]): SourceLine[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const piece of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0]!.y - piece.y) <= SAME_LINE_TOLERANCE) row.push(piece);
    else rows.push([piece]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const piece of row) {
      const gap = piece.x - end > 1 && !/\s$/.test(text) && !/^\s/.test(piece.text);
      text += (text && gap ? " " : "") + piece.text;
      end = piece.x + piece.width;
    }
    return { text: text.replace(/\s+/g, " ").trim(), emphasis: row.every((piece) => piece.bold), list: null, wraps: true };
  });
}

interface FontLike {
  name?: string;
  bold?: boolean;
  black?: boolean;
}

function fontIsBold(objects: { has(id: string): boolean; get(id: string): unknown }, fontName: string): boolean {
  try {
    if (!objects.has(fontName)) return false;
    const font = objects.get(fontName) as FontLike | null;
    return Boolean(font?.bold || font?.black || /bold|black|heavy|semibold/i.test(font?.name ?? ""));
  } catch {
    return false;
  }
}
