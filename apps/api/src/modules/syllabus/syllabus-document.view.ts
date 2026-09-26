import type { SyllabusDocumentDetail, SyllabusDocumentView, SyllabusExtraction } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";

/** Every column the view needs; never the storage key (`file_id`) nor the hash (FR-012). */
export const SYLLABUS_DOCUMENT_VIEW_SELECT = {
  id: true,
  subjectId: true,
  version: true,
  originalFilename: true,
  mediaType: true,
  sizeBytes: true,
  pageCount: true,
  processingStatus: true,
  failureCategory: true,
  extractionResult: true,
  attempts: true,
  createdAt: true,
  processedAt: true,
  revisions: {
    select: { id: true, number: true, status: true, source: true, aiProposalId: true, confirmedAt: true },
    orderBy: { number: "desc" },
  },
} as const satisfies Prisma.SyllabusDocumentSelect;

export const SYLLABUS_DOCUMENT_DETAIL_SELECT = {
  ...SYLLABUS_DOCUMENT_VIEW_SELECT,
  extraction: true,
} as const satisfies Prisma.SyllabusDocumentSelect;

export type SyllabusDocumentViewRow = Prisma.SyllabusDocumentGetPayload<{ select: typeof SYLLABUS_DOCUMENT_VIEW_SELECT }>;
export type SyllabusDocumentDetailRow = Prisma.SyllabusDocumentGetPayload<{
  select: typeof SYLLABUS_DOCUMENT_DETAIL_SELECT;
}>;

/** `SyllabusDocumentView` of the contract: the latest confirmed revision and the open draft, if any. */
export function toSyllabusDocumentView(row: SyllabusDocumentViewRow): SyllabusDocumentView {
  const confirmed = row.revisions.find((revision) => revision.status === "CONFIRMED");
  const draft = row.revisions.find((revision) => revision.status === "DRAFT");
  return {
    id: row.id,
    subjectId: row.subjectId,
    version: row.version,
    originalFilename: row.originalFilename,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    processingStatus: row.processingStatus,
    failureCategory: row.failureCategory,
    extractionResult: row.extractionResult,
    attempts: row.attempts,
    uploadedAt: row.createdAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    confirmedRevision: confirmed ? { id: confirmed.id, number: confirmed.number, source: confirmed.source } : null,
    draftRevisionId: draft?.id ?? null,
  };
}

/** Adds the extraction as stored (never edited) and every revision, newest first. */
export function toSyllabusDocumentDetail(row: SyllabusDocumentDetailRow): SyllabusDocumentDetail {
  return {
    ...toSyllabusDocumentView(row),
    extraction: (row.extraction as SyllabusExtraction | null) ?? null,
    revisions: row.revisions.map((revision) => ({
      id: revision.id,
      number: revision.number,
      status: revision.status,
      source: revision.source,
      aiProposalId: revision.aiProposalId,
      confirmedAt: revision.confirmedAt?.toISOString() ?? null,
    })),
  };
}
