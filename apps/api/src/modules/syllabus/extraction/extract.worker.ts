import { parentPort } from "node:worker_threads";
import { inspectSyllabusFile } from "../syllabus-file-inspector";
import { extractSyllabus, UnreadableSyllabusError } from "./syllabus-extractor";
import type { ExtractResponse, InspectResponse, WorkerRequest } from "./worker-messages";

/**
 * Entry of the reading worker thread (research E8): one task per thread, bytes in, plain data
 * out. It imports no Prisma, configuration, logger or network module, and never logs the
 * document's text. The API enforces the deadline and memory limits from outside.
 */
parentPort?.once("message", (request: WorkerRequest) => {
  void handle(request).then((response) => parentPort!.postMessage(response));
});

async function handle(request: WorkerRequest): Promise<InspectResponse | ExtractResponse> {
  const bytes = new Uint8Array(request.bytes);
  if (request.task === "inspect") {
    try {
      return await inspectSyllabusFile(bytes, request.declaredMediaType, request.extension);
    } catch {
      return { ok: false, code: "FILE_UNREADABLE" };
    }
  }
  try {
    const { result, extraction } = await extractSyllabus(bytes, request.mediaType);
    return { ok: true, result, extraction };
  } catch (error) {
    return { ok: false, category: error instanceof UnreadableSyllabusError ? "UNREADABLE" : "INTERNAL" };
  }
}
