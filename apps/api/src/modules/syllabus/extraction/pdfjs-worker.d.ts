// pdfjs-dist ships no types for its worker module; only the handler is used (pdf-document.ts).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
