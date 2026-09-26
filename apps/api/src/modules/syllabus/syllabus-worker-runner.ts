import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SyllabusFailureCategory, SyllabusMediaType } from "@repo/contracts";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import type { NormalizedBlock } from "./extraction/normalize";
import type { ExtractResponse, InspectResponse, NormalizeResponse, WorkerRequest } from "./extraction/worker-messages";

/** Path of the compiled worker entry; the tests point it at their own build (test/helpers/syllabus-worker.ts). */
export const SYLLABUS_WORKER_PATH = Symbol("SYLLABUS_WORKER_PATH");

/** `dist/modules/syllabus/extraction/extract.worker.js`, next to this file once compiled. */
export const DEFAULT_SYLLABUS_WORKER_PATH = join(__dirname, "extraction", "extract.worker.js");

/** Deadline of the upload inspection (research E6). */
const INSPECT_TIMEOUT_MS = 10_000;

/** Research E8: a hostile file may exhaust at most this much of the worker's heap. */
const RESOURCE_LIMITS = { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 };

export type ExtractOutcome =
  | Extract<ExtractResponse, { ok: true }>
  | { ok: false; category: SyllabusFailureCategory };

type Run<T> = { kind: "done"; value: T } | { kind: "timeout" } | { kind: "crashed" };

/** The normalize worker failed, crashed or could not read the file (007: `AI_TOOL_EXECUTION_FAILED`). */
export class WorkerCrashed extends Error {
  override readonly name = "WorkerCrashed";
}

/** The normalize worker passed its deadline or was aborted (007: `AI_TIMEOUT`). */
export class WorkerTimeout extends Error {
  override readonly name = "WorkerTimeout";
}

/**
 * Runs the inspection and the extraction of a syllabus file in a worker thread of its own
 * (research E8), with a deadline enforced by `terminate()` and limited memory. The worker gets
 * only the bytes and no environment variables.
 */
@Injectable()
export class SyllabusWorkerRunner {
  private readonly logger = new Logger("SyllabusWorker");

  constructor(
    @Inject(SYLLABUS_WORKER_PATH) private readonly workerPath: string,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A deadline or a crash while inspecting means the file is too heavy to read: `FILE_TOO_COMPLEX`. */
  async inspect(bytes: Uint8Array, declaredMediaType: string, extension: string): Promise<InspectResponse> {
    const run = await this.run<InspectResponse>(
      { task: "inspect", bytes: copy(bytes), declaredMediaType, extension },
      INSPECT_TIMEOUT_MS,
    );
    return run.kind === "done" ? run.value : { ok: false, code: "FILE_TOO_COMPLEX" };
  }

  async extract(bytes: Uint8Array, mediaType: SyllabusMediaType): Promise<ExtractOutcome> {
    const run = await this.run<ExtractResponse>(
      { task: "extract", bytes: copy(bytes), mediaType },
      this.config.syllabus.processingTimeoutSeconds * 1000,
    );
    if (run.kind === "done") return run.value;
    return { ok: false, category: run.kind === "timeout" ? "TIMEOUT" : "INTERNAL" };
  }

  /**
   * The normalized blocks of a PDF or DOCX (007 research C11), in the same kind of worker thread.
   * The caller gives the deadline (the tool's) and may abort; the text never leaves the result.
   */
  async normalize(
    bytes: Uint8Array,
    mediaType: "PDF" | "DOCX",
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<NormalizedBlock[]> {
    const run = await this.run<NormalizeResponse>({ task: "normalize", bytes: copy(bytes), mediaType }, timeoutMs, signal);
    if (run.kind === "timeout") throw new WorkerTimeout();
    if (run.kind === "crashed" || !run.value.ok) throw new WorkerCrashed();
    return run.value.blocks;
  }

  private run<T>(request: WorkerRequest, timeoutMs: number, signal?: AbortSignal): Promise<Run<T>> {
    if (signal?.aborted) return Promise.resolve({ kind: "timeout" });
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(this.workerPath, { resourceLimits: RESOURCE_LIMITS, env: {}, stdout: true, stderr: true });
      // Whatever a library prints in the worker is dropped: it could quote the document.
      worker.stdout.resume();
      worker.stderr.resume();
      const finish = (outcome: Run<T>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        void worker.terminate();
        resolve(outcome);
      };
      const timer = setTimeout(() => {
        this.logger.warn({ task: request.task, timeoutMs }, "syllabus.worker_timeout");
        finish({ kind: "timeout" });
      }, timeoutMs);
      const onAbort = () => finish({ kind: "timeout" });
      signal?.addEventListener("abort", onAbort, { once: true });

      worker.once("message", (value: T) => finish({ kind: "done", value }));
      // Out of memory (ERR_WORKER_OUT_OF_MEMORY), a crash or an exit without an answer.
      worker.once("error", (error) => {
        this.logger.warn({ task: request.task, errorName: error.name }, "syllabus.worker_failed");
        finish({ kind: "crashed" });
      });
      worker.once("exit", () => finish({ kind: "crashed" }));
      worker.postMessage(request, [request.bytes]);
    });
  }
}

/** A standalone buffer to transfer, so the caller's bytes stay usable. */
function copy(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
