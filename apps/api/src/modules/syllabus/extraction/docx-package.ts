import { MAX_DOCX_ENTRIES, MAX_DOCX_UNZIPPED_BYTES } from "@repo/contracts";
import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";

/** The parts of a DOCX the inspector and the extractor read; every other entry is only counted. */
export const DOCX_PARTS = ["[Content_Types].xml", "word/document.xml", "word/numbering.xml", "word/styles.xml"] as const;
export type DocxPart = (typeof DOCX_PARTS)[number];

export interface DocxPackage {
  /** Every entry name, in the order of the archive. */
  names: string[];
  parts: Partial<Record<DocxPart, string>>;
}

export class DocxPackageError extends Error {
  override readonly name = "DocxPackageError";
  constructor(readonly reason: "TOO_COMPLEX" | "UNREADABLE") {
    super(reason);
  }
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

/**
 * Reads a DOCX (zip) with the limits of research E6, twice over: first the central directory
 * (entry count and declared sizes), then the real bytes while inflating, so a header that lies
 * about sizes cannot get past the 50 MB budget. Throws `DocxPackageError`.
 */
export function readDocxPackage(bytes: Uint8Array): DocxPackage {
  checkCentralDirectory(bytes);

  const names: string[] = [];
  const chunks = new Map<DocxPart, Uint8Array[]>();
  let inflated = 0;
  let overBudget = false;

  const unzip = new Unzip((file) => {
    names.push(file.name);
    if (names.length > MAX_DOCX_ENTRIES) {
      overBudget = true;
      return;
    }
    const wanted = (DOCX_PARTS as readonly string[]).includes(file.name) ? (file.name as DocxPart) : null;
    if (wanted) chunks.set(wanted, []);
    file.ondata = (error, data) => {
      if (error) throw new DocxPackageError("UNREADABLE");
      inflated += data.length;
      if (inflated > MAX_DOCX_UNZIPPED_BYTES) {
        overBudget = true;
        file.terminate();
        return;
      }
      if (wanted) chunks.get(wanted)!.push(data);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  try {
    unzip.push(bytes, true);
  } catch (error) {
    if (error instanceof DocxPackageError) throw error;
    throw new DocxPackageError(overBudget ? "TOO_COMPLEX" : "UNREADABLE");
  }
  if (overBudget) throw new DocxPackageError("TOO_COMPLEX");
  if (names.length === 0) throw new DocxPackageError("UNREADABLE");

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const parts: DocxPackage["parts"] = {};
  for (const [name, pieces] of chunks) parts[name] = decoder.decode(concat(pieces));
  return { names, parts };
}

/** Entry count and the sum of the declared uncompressed sizes, from the end of central directory record. */
function checkCentralDirectory(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new DocxPackageError("UNREADABLE");

  const entries = view.getUint16(eocd + 10, true);
  const size = view.getUint32(eocd + 12, true);
  const offset = view.getUint32(eocd + 16, true);
  // 0xFFFF / 0xFFFFFFFF mean ZIP64, which a syllabus never needs.
  if (entries === 0xffff || offset === 0xffffffff) throw new DocxPackageError("TOO_COMPLEX");
  if (entries > MAX_DOCX_ENTRIES) throw new DocxPackageError("TOO_COMPLEX");
  if (offset + size > eocd) throw new DocxPackageError("UNREADABLE");

  let position = offset;
  let declared = 0;
  for (let index = 0; index < entries; index++) {
    if (position + 46 > eocd || view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
      throw new DocxPackageError("UNREADABLE");
    }
    declared += view.getUint32(position + 24, true);
    if (declared > MAX_DOCX_UNZIPPED_BYTES) throw new DocxPackageError("TOO_COMPLEX");
    position +=
      46 + view.getUint16(position + 28, true) + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - EOCD_MIN;
  const first = Math.max(0, last - MAX_COMMENT);
  for (let position = last; position >= first; position--) {
    if (view.getUint32(position, true) === EOCD_SIGNATURE) return position;
  }
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
