import { MAX_IMAGE_PIXELS, MAX_PDF_PAGES, type SyllabusMediaType } from "@repo/contracts";
import { DocxPackageError, readDocxPackage } from "./extraction/docx-package";
import { PdfOpenError, withPdf } from "./extraction/pdf-document";

/** Upload rejections decided by the file's content (contracts/http-api.md, 400). */
export type FileRejectionCode =
  | "FILE_TYPE_NOT_ALLOWED"
  | "FILE_UNREADABLE"
  | "FILE_PROTECTED"
  | "FILE_MACROS"
  | "FILE_TOO_COMPLEX";

export type InspectionResult =
  | { ok: true; mediaType: SyllabusMediaType; pageCount: number | null }
  | { ok: false; code: FileRejectionCode };

interface FormatRule {
  extensions: readonly string[];
  /** `Content-Type`s a browser may declare for it. */
  declared: readonly string[];
}

const FORMATS: Record<SyllabusMediaType, FormatRule> = {
  PDF: { extensions: [".pdf"], declared: ["application/pdf", "application/x-pdf"] },
  DOCX: {
    extensions: [".docx"],
    declared: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  PNG: { extensions: [".png"], declared: ["image/png"] },
  JPEG: { extensions: [".jpg", ".jpeg"], declared: ["image/jpeg", "image/pjpeg", "image/jpg"] },
};

/** Declarations that say nothing about the type (some systems send them for DOCX); they never disagree. */
const UNSPECIFIED_TYPES = new Set(["", "application/octet-stream"]);

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\3\4
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const DOCX_MAIN_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

const reject = (code: FileRejectionCode): InspectionResult => ({ ok: false, code });

/**
 * Decides what an uploaded file is from its bytes, never from its name or declared type, and
 * requires the three to agree (research E6). Then opens it far enough to refuse protected,
 * macro-enabled, corrupted or oversized content before anything is stored. Runs in the worker
 * thread (E8); `extension` is the lower-case extension of the original name, with the dot.
 */
export async function inspectSyllabusFile(
  bytes: Uint8Array,
  declaredMediaType: string,
  extension: string,
): Promise<InspectionResult> {
  if (startsWith(bytes, OLE_SIGNATURE)) {
    // An encrypted DOCX is an OLE container; any other OLE file (.doc, .xls…) is not accepted.
    return extension === ".docx" ? reject("FILE_PROTECTED") : reject("FILE_TYPE_NOT_ALLOWED");
  }
  const mediaType = signatureType(bytes);
  if (!mediaType || !agrees(mediaType, declaredMediaType, extension)) return reject("FILE_TYPE_NOT_ALLOWED");

  switch (mediaType) {
    case "PDF":
      return inspectPdf(bytes);
    case "DOCX":
      return inspectDocx(bytes);
    case "PNG":
      return inspectPng(bytes);
    case "JPEG":
      return inspectJpeg(bytes);
  }
}

function signatureType(bytes: Uint8Array): SyllabusMediaType | null {
  if (startsWith(bytes, PDF_SIGNATURE)) return "PDF";
  if (startsWith(bytes, ZIP_SIGNATURE)) return "DOCX";
  if (startsWith(bytes, PNG_SIGNATURE)) return "PNG";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "JPEG";
  return null;
}

function agrees(mediaType: SyllabusMediaType, declaredMediaType: string, extension: string): boolean {
  const rule = FORMATS[mediaType];
  const declared = declaredMediaType.split(";")[0]!.trim().toLowerCase();
  return rule.extensions.includes(extension) && (UNSPECIFIED_TYPES.has(declared) || rule.declared.includes(declared));
}

async function inspectPdf(bytes: Uint8Array): Promise<InspectionResult> {
  try {
    const pageCount = await withPdf(bytes, async (document) => document.numPages);
    if (pageCount < 1) return reject("FILE_UNREADABLE");
    if (pageCount > MAX_PDF_PAGES) return reject("FILE_TOO_COMPLEX");
    return { ok: true, mediaType: "PDF", pageCount };
  } catch (error) {
    if (error instanceof PdfOpenError) return reject(error.reason === "PROTECTED" ? "FILE_PROTECTED" : "FILE_UNREADABLE");
    return reject("FILE_UNREADABLE");
  }
}

function inspectDocx(bytes: Uint8Array): InspectionResult {
  let names: string[];
  let contentTypes: string | undefined;
  try {
    const docx = readDocxPackage(bytes);
    names = docx.names;
    contentTypes = docx.parts["[Content_Types].xml"];
  } catch (error) {
    if (error instanceof DocxPackageError) return reject(error.reason === "TOO_COMPLEX" ? "FILE_TOO_COMPLEX" : "FILE_UNREADABLE");
    return reject("FILE_UNREADABLE");
  }
  if (names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name)) || /macroEnabled/i.test(contentTypes ?? "")) {
    return reject("FILE_MACROS");
  }
  // A zip that is not a Word document (e.g. an .xlsx renamed to .docx).
  if (!contentTypes?.includes(DOCX_MAIN_TYPE) || !names.includes("word/document.xml")) {
    return reject("FILE_TYPE_NOT_ALLOWED");
  }
  return { ok: true, mediaType: "DOCX", pageCount: null };
}

/** IHDR right after the signature, a size limit, and chunks well formed up to IEND. */
function inspectPng(bytes: Uint8Array): InspectionResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = PNG_SIGNATURE.length;
  if (bytes.length < position + 25 || view.getUint32(position) !== 13 || chunkType(bytes, position + 4) !== "IHDR") {
    return reject("FILE_UNREADABLE");
  }
  const width = view.getUint32(position + 8);
  const height = view.getUint32(position + 12);
  if (width === 0 || height === 0) return reject("FILE_UNREADABLE");
  if (width * height > MAX_IMAGE_PIXELS) return reject("FILE_TOO_COMPLEX");

  while (position + 12 <= bytes.length) {
    const length = view.getUint32(position);
    const type = chunkType(bytes, position + 4);
    position += 12 + length;
    if (position > bytes.length) break;
    if (type === "IEND") return { ok: true, mediaType: "PNG", pageCount: null };
  }
  return reject("FILE_UNREADABLE");
}

/** Start-of-frame markers that carry the image size (baseline, progressive, lossless…). */
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** Segments from SOI up to the scan: one SOF with the size; the file ends with EOI. */
function inspectJpeg(bytes: Uint8Array): InspectionResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return reject("FILE_UNREADABLE");

  let position = 2;
  let pixels: number | null = null;
  while (position + 4 <= bytes.length) {
    if (bytes[position] !== 0xff) return reject("FILE_UNREADABLE");
    const marker = bytes[position + 1]!;
    if (marker === 0xff) {
      position += 1; // fill byte
      continue;
    }
    const length = view.getUint16(position + 2);
    if (length < 2 || position + 2 + length > bytes.length) return reject("FILE_UNREADABLE");
    if (SOF_MARKERS.has(marker)) {
      if (length < 7) return reject("FILE_UNREADABLE");
      pixels = view.getUint16(position + 5) * view.getUint16(position + 7);
    }
    if (marker === 0xda) break; // start of scan: the headers are over
    position += 2 + length;
  }
  if (!pixels) return reject("FILE_UNREADABLE");
  if (pixels > MAX_IMAGE_PIXELS) return reject("FILE_TOO_COMPLEX");
  return { ok: true, mediaType: "JPEG", pageCount: null };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function chunkType(bytes: Uint8Array, position: number): string {
  return String.fromCharCode(...bytes.subarray(position, position + 4));
}
