import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { MAX_PROCESSING_ATTEMPTS } from "@repo/contracts";
import { Prisma, type SyllabusFailureCategory, type SyllabusMediaType } from "../../generated/prisma/client";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import { FileStorage } from "../../platform/storage/file-storage";
import { AuditService } from "../audit/audit.service";
import { SyllabusProcessingStateMachine as machine } from "./syllabus-processing.state-machine";
import { type ExtractOutcome, SyllabusWorkerRunner } from "./syllabus-worker-runner";

/** Documents claimed per cycle (research E7). */
const BATCH_SIZE = 2;
/** How long a claim lasts; after that another cycle (or instance) may take the document again. */
const LEASE_SECONDS = 180;

interface Claimed {
  id: string;
  file_id: string;
  media_type: SyllabusMediaType;
  attempts: number;
}

/**
 * Processes uploaded syllabus documents (research E7, contracts/syllabus-processing.md). The
 * `syllabus_documents` table is the queue: a cycle claims up to 2 due documents with `FOR UPDATE
 * SKIP LOCKED` (so each is processed once, 004/SC-009), moves them to `PROCESSING` with a 3-minute
 * lease, extracts outside any transaction in a worker thread, then records the outcome only if
 * the claim is still its own. `SYLLABUS_PROCESSING_INTERVAL_SECONDS=0` turns everything off,
 * `kick()` included (kill switch, 004/FR-015); tests call `runOnce(now)`.
 */
@Injectable()
export class SyllabusProcessingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("SyllabusProcessing");
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly storage: FileStorage,
    private readonly runner: SyllabusWorkerRunner,
    private readonly audit: AuditService,
  ) {}

  /** One cycle at `now`; returns how many documents it claimed. */
  async runOnce(now = new Date()): Promise<number> {
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      UPDATE syllabus_documents
      SET processing_status = 'PROCESSING',
          attempts = attempts + 1,
          lease_expires_at = ${now}::timestamptz + make_interval(secs => ${LEASE_SECONDS}),
          updated_at = ${now}
      WHERE id IN (
        SELECT id FROM syllabus_documents
        WHERE (processing_status = 'UPLOADED' AND next_attempt_at <= ${now})
           OR (processing_status = 'PROCESSING' AND lease_expires_at < ${now})
        ORDER BY next_attempt_at, id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, file_id, media_type, attempts`;

    for (const document of claimed) {
      try {
        await this.process(document, now);
      } catch (error) {
        this.logger.error(
          { documentId: document.id, errorName: error instanceof Error ? error.name : "unknown" },
          "syllabus.processing_error",
        );
      }
    }
    return claimed.length;
  }

  /**
   * Starts a cycle right away (after an upload or a retry) instead of waiting for the timer.
   * Never overlaps a running cycle: it asks for one more when the current one ends. Does nothing
   * when processing is switched off.
   */
  kick(): void {
    if (this.config.syllabus.processingIntervalSeconds <= 0) return;
    void this.runScheduled();
  }

  onApplicationBootstrap(): void {
    const seconds = this.config.syllabus.processingIntervalSeconds;
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.runScheduled(), seconds * 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.again = false;
    await this.running;
  }

  private runScheduled(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.runOnce();
        } while (this.again);
      } catch (error) {
        this.logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "syllabus.processing_run_failed");
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async process(document: Claimed, now: Date): Promise<void> {
    // The previous attempt was lost (the API stopped mid-extraction) and it was the last one.
    if (document.attempts > MAX_PROCESSING_ATTEMPTS) {
      await this.record(document, { ok: false, category: "TIMEOUT" }, now, MAX_PROCESSING_ATTEMPTS);
      return;
    }
    let outcome: ExtractOutcome;
    try {
      const bytes = await this.storage.get(document.file_id);
      outcome = await this.runner.extract(bytes, document.media_type);
    } catch {
      outcome = { ok: false, category: "INTERNAL" };
    }
    await this.record(document, outcome, now, document.attempts);
  }

  /** Writes the outcome if the document is still under this claim (same attempt, still PROCESSING). */
  private async record(document: Claimed, outcome: ExtractOutcome, now: Date, attempts: number): Promise<void> {
    await this.prisma.runInTransaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ processing_status: string; attempts: number }[]>`
        SELECT processing_status, attempts FROM syllabus_documents WHERE id = ${document.id}::uuid FOR UPDATE`;
      if (!current || current.processing_status !== "PROCESSING" || current.attempts !== document.attempts) return;

      if (outcome.ok) {
        machine.assertTransition("PROCESSING", "PROCESSED");
        const text = outcome.result === "TEXT";
        await tx.syllabusDocument.update({
          where: { id: document.id },
          data: {
            processingStatus: "PROCESSED",
            extractionResult: outcome.result,
            // A NO_TEXT document has nothing to review from: the teacher fills it in by hand.
            extraction: text ? (outcome.extraction as Prisma.InputJsonObject) : Prisma.DbNull,
            extractorVersion: outcome.extraction.extractorVersion,
            processedAt: now,
            leaseExpiresAt: null,
            failureCategory: null,
          },
        });
        await this.audit.record(tx, {
          type: "syllabus.processed",
          actorType: "SYSTEM",
          targetType: "SYLLABUS_DOCUMENT",
          targetId: document.id,
          metadata: {
            result: outcome.result,
            groupCount: text ? outcome.extraction.groups.length : 0,
            itemCount: text ? outcome.extraction.groups.reduce((sum, group) => sum + group.items.length, 0) : 0,
            attempts,
            extractorVersion: outcome.extraction.extractorVersion,
          },
        });
        return;
      }

      const category: SyllabusFailureCategory = outcome.category;
      const next = machine.afterFailure(category, attempts);
      machine.assertTransition("PROCESSING", next.to);
      if (next.to === "UPLOADED") {
        await tx.syllabusDocument.update({
          where: { id: document.id },
          data: {
            processingStatus: "UPLOADED",
            nextAttemptAt: new Date(now.getTime() + next.retryInSeconds * 1000),
            leaseExpiresAt: null,
            // Only a final failure shows a category; the transient one goes to the log.
            failureCategory: null,
          },
        });
        this.logger.warn({ documentId: document.id, attempt: attempts, category }, "syllabus.processing_retry");
        return;
      }
      await tx.syllabusDocument.update({
        where: { id: document.id },
        data: { processingStatus: "FAILED", attempts, leaseExpiresAt: null, failureCategory: category },
      });
      await this.audit.record(tx, {
        type: "syllabus.processing_failed",
        actorType: "SYSTEM",
        targetType: "SYLLABUS_DOCUMENT",
        targetId: document.id,
        metadata: { category, attempts },
      });
    });
  }
}
