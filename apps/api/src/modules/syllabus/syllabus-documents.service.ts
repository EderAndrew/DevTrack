import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  SyllabusDocumentDetail,
  SyllabusDocumentList,
  SyllabusDocumentView,
  SyllabusMediaType,
  SyllabusProcessingStatus,
  SyllabusUploadResult,
} from "@repo/contracts";
import { APP_CONFIG } from "../../platform/config/config.module";
import type { AppConfig } from "../../platform/config/config.schema";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound, rateLimited, subjectInactive, validationError } from "../../platform/http/errors";
import type { UploadedSyllabusFile } from "../../platform/http/upload";
import type { AuthContext } from "../../platform/http/request-context";
import { RateLimitService } from "../../platform/rate-limit/rate-limit.service";
import { FileStorage } from "../../platform/storage/file-storage";
import { AuditService } from "../audit/audit.service";
import { SubjectContextPolicy } from "../subjects/subject-context.policy";
import { fileExtension, sanitizeOriginalFilename } from "./original-filename";
import {
  SYLLABUS_DOCUMENT_DETAIL_SELECT,
  SYLLABUS_DOCUMENT_VIEW_SELECT,
  toSyllabusDocumentDetail,
  toSyllabusDocumentView,
} from "./syllabus-document.view";
import { SyllabusProcessingStateMachine as machine } from "./syllabus-processing.state-machine";
import { SyllabusProcessingWorker } from "./syllabus-processing.worker";
import { SyllabusWorkerRunner } from "./syllabus-worker-runner";

const HOUR_SEC = 3600;

/** `Content-Type` served for each validated type (research E18). */
const CONTENT_TYPES: Record<SyllabusMediaType, string> = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PNG: "image/png",
  JPEG: "image/jpeg",
};

/** What the controller streams back on a download. */
export interface SyllabusFileDownload {
  bytes: Buffer;
  contentType: string;
  filename: string;
  inline: boolean;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest();

/**
 * Syllabus documents of a teacher's subject (004 US2, FR-006 – FR-016): upload of an immutable
 * original, versions per subject, download and "Tentar novamente". Every lookup is scoped to
 * the session teacher's subjects, so anything else is a plain 404 (E3).
 */
@Injectable()
export class SyllabusDocumentsService {
  private readonly logger = new Logger("SyllabusDocuments");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly subjects: SubjectContextPolicy,
    private readonly storage: FileStorage,
    private readonly runner: SyllabusWorkerRunner,
    private readonly worker: SyllabusProcessingWorker,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  /** Newest version first. */
  async list(teacherId: string, subjectId: string): Promise<SyllabusDocumentList> {
    await this.subjects.findOwnedOrNotFound(teacherId, subjectId);
    const rows = await this.prisma.syllabusDocument.findMany({
      where: { subjectId },
      select: SYLLABUS_DOCUMENT_VIEW_SELECT,
      orderBy: { version: "desc" },
    });
    return { items: rows.map(toSyllabusDocumentView) };
  }

  /**
   * Checks the file in the worker thread before writing anything (E6), then stores the original
   * and the new version in one transaction (E4). The same bytes again in the subject return the
   * existing version (`duplicate: true`, FR-011). Processing starts after the commit.
   */
  async upload(
    auth: AuthContext,
    subjectId: string,
    file: UploadedSyllabusFile,
    requestId: string | null,
  ): Promise<SyllabusUploadResult> {
    await this.enforce("syllabus:upload", auth.userId, this.config.rateLimit.syllabusUploadsHourly);
    const subject = await this.subjects.findOwnedOrNotFound(auth.userId, subjectId);
    if (subject.status !== "ACTIVE") throw subjectInactive();

    const inspection = await this.runner.inspect(file.bytes, file.declaredMediaType, fileExtension(file.originalName));
    if (!inspection.ok) {
      // FR-048: the code and sizes only, never the file name.
      this.logger.warn(
        { code: inspection.code, declaredType: file.declaredMediaType, sizeBytes: file.bytes.length },
        "syllabus.upload_rejected",
      );
      throw new AppException(inspection.code);
    }

    const digest = sha256(file.bytes);
    const result = await this.prisma.runInTransaction(async (tx) => {
      // Versions of one subject are numbered one at a time.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`syllabus_document_version:${subjectId}`}, 0))`;
      const locked = await tx.subject.findUniqueOrThrow({ where: { id: subjectId }, select: { status: true } });
      if (locked.status !== "ACTIVE") throw subjectInactive();

      const existing = await tx.syllabusDocument.findUnique({
        where: { subjectId_sha256: { subjectId, sha256: new Uint8Array(digest) } },
        select: SYLLABUS_DOCUMENT_VIEW_SELECT,
      });
      if (existing) return { document: toSyllabusDocumentView(existing), duplicate: true };

      const last = await tx.syllabusDocument.aggregate({ where: { subjectId }, _max: { version: true } });
      const stored = await this.storage.put(tx, file.bytes);
      const version = (last._max.version ?? 0) + 1;
      const row = await tx.syllabusDocument.create({
        data: {
          subjectId,
          version,
          fileId: stored.key,
          originalFilename: sanitizeOriginalFilename(file.originalName, inspection.mediaType),
          mediaType: inspection.mediaType,
          sizeBytes: stored.sizeBytes,
          sha256: new Uint8Array(stored.sha256),
          pageCount: inspection.pageCount,
          uploadedById: auth.userId,
        },
        select: SYLLABUS_DOCUMENT_VIEW_SELECT,
      });
      await this.audit.record(tx, {
        type: "syllabus.uploaded",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SYLLABUS_DOCUMENT",
        targetId: row.id,
        requestId,
        metadata: { subjectId, version, mediaType: inspection.mediaType, sizeBytes: stored.sizeBytes },
      });
      return { document: toSyllabusDocumentView(row), duplicate: false };
    });

    if (!result.duplicate) this.worker.kick();
    return result;
  }

  async getDetail(teacherId: string, documentId: string): Promise<SyllabusDocumentDetail> {
    const row = await this.prisma.syllabusDocument.findFirst({
      where: { id: documentId, subject: { teacherId } },
      select: SYLLABUS_DOCUMENT_DETAIL_SELECT,
    });
    if (!row) throw notFound();
    return toSyllabusDocumentDetail(row);
  }

  /**
   * The original bytes, checked against their SHA-256 by the storage (E18). Only images may be
   * shown inline; PDF and DOCX are always downloaded, never rendered on the app's origin.
   */
  async download(teacherId: string, documentId: string, inline: boolean): Promise<SyllabusFileDownload> {
    const row = await this.prisma.syllabusDocument.findFirst({
      where: { id: documentId, subject: { teacherId } },
      select: { fileId: true, mediaType: true, originalFilename: true },
    });
    if (!row) throw notFound();
    if (inline && row.mediaType !== "PNG" && row.mediaType !== "JPEG") throw validationError();
    return {
      bytes: await this.storage.get(row.fileId),
      contentType: CONTENT_TYPES[row.mediaType],
      filename: row.originalFilename,
      inline,
    };
  }

  /** "Tentar novamente" (FR-016): FAILED → UPLOADED with the attempts reset; its own hourly limit. */
  async retry(auth: AuthContext, documentId: string): Promise<SyllabusDocumentView> {
    await this.enforce("syllabus:retry", auth.userId, this.config.rateLimit.syllabusRetriesHourly);
    const view = await this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockOwned(tx, auth.userId, documentId);
      // Only a final failure can be retried; PROCESSING → UPLOADED belongs to the worker.
      if (current.processing_status !== "FAILED") throw invalidStateTransition();
      machine.assertTransition(current.processing_status, "UPLOADED");
      const row = await tx.syllabusDocument.update({
        where: { id: documentId },
        data: {
          processingStatus: "UPLOADED",
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseExpiresAt: null,
          failureCategory: null,
        },
        select: SYLLABUS_DOCUMENT_VIEW_SELECT,
      });
      return toSyllabusDocumentView(row);
    });
    this.worker.kick();
    return view;
  }

  private async lockOwned(tx: Tx, teacherId: string, documentId: string) {
    const [row] = await tx.$queryRaw<{ processing_status: SyllabusProcessingStatus }[]>`
      SELECT d.processing_status FROM syllabus_documents d
      JOIN subjects s ON s.id = d.subject_id
      WHERE d.id = ${documentId}::uuid AND s.teacher_id = ${teacherId}::uuid
      FOR UPDATE OF d`;
    if (!row) throw notFound();
    return row;
  }

  private async enforce(scope: string, teacherId: string, limit: number): Promise<void> {
    const state = await this.rateLimit.hit(scope, teacherId, { limit, windowSec: HOUR_SEC });
    if (state.blocked) throw rateLimited(state.retryAfterSec);
  }
}
