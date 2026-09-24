import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// pdfjs parses on a "worker"; in Node it runs in the same thread when the handler is on the
// global object, which is what we want: this module already runs inside a worker thread (E8).
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= { WorkerMessageHandler };

export type PdfDocument = pdfjs.PDFDocumentProxy;

/** Why a PDF could not be opened. */
export type PdfOpenFailure = "PROTECTED" | "UNREADABLE";

export class PdfOpenError extends Error {
  override readonly name = "PdfOpenError";
  constructor(readonly reason: PdfOpenFailure) {
    super(reason);
  }
}

/**
 * Opens a PDF with the hardened options of research E8: no font faces, no system or standard
 * fonts fetched from anywhere, stop at the first parsing error. pdfjs 6 no longer evaluates code
 * (the `isEvalSupported` option of E8 was removed with its `eval` path), so there is nothing to
 * switch off there. `use` runs with the open document; it is always closed.
 */
export async function withPdf<T>(bytes: Uint8Array, use: (document: PdfDocument) => Promise<T>): Promise<T> {
  const task = pdfjs.getDocument({
    // pdfjs takes ownership of (and may detach) the buffer it receives: give it a copy.
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  let document: PdfDocument;
  try {
    document = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => undefined);
    throw new PdfOpenError(error instanceof Error && error.name === "PasswordException" ? "PROTECTED" : "UNREADABLE");
  }
  try {
    return await use(document);
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
