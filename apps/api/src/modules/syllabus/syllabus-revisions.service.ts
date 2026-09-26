import { Injectable } from "@nestjs/common";
import {
  type CreateSyllabusRevisionRequest,
  MAX_ITEMS_PER_REVISION,
  type SaveSyllabusRevisionRequest,
  type SyllabusExtraction,
  type SyllabusExtractionResult,
  type SyllabusRevisionStatus,
  type SyllabusRevisionView,
} from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, notFound, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { createDraft, type DraftContent, rewriteDraft } from "./syllabus-revision-drafts";
import { SYLLABUS_REVISION_VIEW_SELECT, toSyllabusRevisionView } from "./syllabus-revision.view";

const EMPTY: DraftContent = { title: null, syllabusText: null, competencyText: null, groups: [] };

/** Blank → null; longer than the save limit → cut, so the prefilled draft can be saved as it is. */
const clip = (value: string | null | undefined, max: number) => {
  const text = value?.trim().slice(0, max).trim();
  return text ? text : null;
};

/**
 * The extraction as a draft (004/US3-1), within the limits of `SaveSyllabusRevisionRequest`: empty
 * items are dropped and at most 500 items are kept. The extraction itself is never changed (FR-017).
 */
function fromExtraction(extraction: SyllabusExtraction): DraftContent {
  let budget = MAX_ITEMS_PER_REVISION;
  const groups = extraction.groups.map((group) => {
    const texts = group.items.flatMap((item) => {
      const text = clip(item, 1000);
      return text ? [text] : [];
    });
    const kept = texts.slice(0, budget);
    budget -= kept.length;
    return { title: clip(group.title, 300), items: kept.map((text) => ({ text, originItemId: null })) };
  });
  return {
    title: clip(extraction.title, 200),
    syllabusText: clip(extraction.syllabusText, 10_000),
    competencyText: clip(extraction.competencyText, 10_000),
    groups,
  };
}

/**
 * Reviewed content of a syllabus document (004 US3, FR-021 – FR-024, research E11). A document
 * has at most one DRAFT revision, started from the extraction, from an empty form ("Preencher
 * manualmente") or from a confirmed revision. A confirmed revision never changes (the triggers
 * enforce it as well); correcting it means a new revision based on it. Every lookup goes through
 * the session teacher's subjects, so anything else is a plain 404 (E3).
 */
@Injectable()
export class SyllabusRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(auth: AuthContext, documentId: string, body: CreateSyllabusRevisionRequest): Promise<SyllabusRevisionView> {
    // An AI_ASSISTED draft comes only from applying a proposal (007 research C10); the contract
    // already refuses it, and this keeps any other caller from creating one.
    if ((body.source as string) === "AI_ASSISTED") throw validationError();
    return this.prisma.runInTransaction(async (tx) => {
      // The document's row lock serializes the drafts and the numbers of one document.
      const [document] = await tx.$queryRaw<{ extraction_result: SyllabusExtractionResult | null; extraction: unknown }[]>`
        SELECT d.extraction_result, d.extraction FROM syllabus_documents d
        JOIN subjects s ON s.id = d.subject_id
        WHERE d.id = ${documentId}::uuid AND s.teacher_id = ${auth.userId}::uuid
        FOR UPDATE OF d`;
      if (!document) throw notFound();

      let content = EMPTY;
      if (body.source === "REVISION") {
        const base = await tx.syllabusRevision.findFirst({
          where: { id: body.basedOnRevisionId!, documentId },
          select: { status: true, title: true, syllabusText: true, competencyText: true, groups: {
            select: { title: true, items: { select: { id: true, text: true }, orderBy: { position: "asc" } } },
            orderBy: { position: "asc" },
          } },
        });
        if (!base) throw notFound();
        if (base.status !== "CONFIRMED") throw new AppException("REVISION_NOT_CONFIRMED");
        content = {
          title: base.title,
          syllabusText: base.syllabusText,
          competencyText: base.competencyText,
          groups: base.groups.map((group) => ({
            title: group.title,
            items: group.items.map((item) => ({ text: item.text, originItemId: item.id })),
          })),
        };
      }

      const draft = await tx.syllabusRevision.findFirst({ where: { documentId, status: "DRAFT" }, select: { id: true } });
      if (draft) throw new AppException("REVISION_DRAFT_EXISTS");

      if (body.source === "EXTRACTION") {
        if (document.extraction_result !== "TEXT" || !document.extraction) throw new AppException("EXTRACTION_UNAVAILABLE");
        content = fromExtraction(document.extraction as SyllabusExtraction);
      }

      const revision = await createDraft(
        tx,
        documentId,
        { source: body.source, basedOnRevisionId: body.source === "REVISION" ? body.basedOnRevisionId! : null },
        content,
      );
      return this.view(tx, revision.id);
    });
  }

  async get(teacherId: string, revisionId: string): Promise<SyllabusRevisionView> {
    const row = await this.prisma.syllabusRevision.findFirst({
      where: { id: revisionId, document: { subject: { teacherId } } },
      select: SYLLABUS_REVISION_VIEW_SELECT,
    });
    if (!row) throw notFound();
    return toSyllabusRevisionView(row);
  }

  /**
   * Replaces the whole content of a DRAFT (FR-021): its groups and items are deleted and written
   * again in the order sent. An item sent with its id in this draft keeps its origin (E16).
   */
  async save(auth: AuthContext, revisionId: string, body: SaveSyllabusRevisionRequest): Promise<SyllabusRevisionView> {
    return this.prisma.runInTransaction(async (tx) => {
      const status = await this.lockOwned(tx, auth.userId, revisionId);
      if (status === "CONFIRMED") throw new AppException("REVISION_CONFIRMED");

      const current = await tx.syllabusItem.findMany({ where: { revisionId }, select: { id: true, originItemId: true } });
      const origins = new Map(current.map((item) => [item.id, item.originItemId]));
      await rewriteDraft(tx, revisionId, {
        title: body.title || null,
        syllabusText: body.syllabusText || null,
        competencyText: body.competencyText || null,
        groups: body.groups.map((group) => ({
          title: group.title || null,
          items: group.items.map((item) => ({
            text: item.text,
            originItemId: (item.id && origins.get(item.id)) ?? null,
          })),
        })),
      });
      return this.view(tx, revisionId);
    });
  }

  /**
   * DRAFT → CONFIRMED (FR-023): needs at least one item; from then on the revision is immutable.
   * Confirming a confirmed revision again changes nothing and answers the same view.
   */
  async confirm(auth: AuthContext, revisionId: string, requestId: string | null): Promise<SyllabusRevisionView> {
    return this.prisma.runInTransaction(async (tx) => {
      const status = await this.lockOwned(tx, auth.userId, revisionId);
      if (status === "CONFIRMED") return this.view(tx, revisionId);

      const [itemCount, groupCount] = await Promise.all([
        tx.syllabusItem.count({ where: { revisionId } }),
        tx.syllabusGroup.count({ where: { revisionId } }),
      ]);
      if (itemCount === 0) throw new AppException("REVISION_EMPTY");

      const revision = await tx.syllabusRevision.update({
        where: { id: revisionId },
        data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: auth.userId },
        select: { documentId: true, number: true, source: true },
      });
      await this.audit.record(tx, {
        type: "syllabus.revision_confirmed",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SYLLABUS_REVISION",
        targetId: revisionId,
        requestId,
        metadata: { documentId: revision.documentId, number: revision.number, source: revision.source, groupCount, itemCount },
      });
      return this.view(tx, revisionId);
    });
  }

  private async view(tx: Tx, revisionId: string): Promise<SyllabusRevisionView> {
    const row = await tx.syllabusRevision.findUniqueOrThrow({ where: { id: revisionId }, select: SYLLABUS_REVISION_VIEW_SELECT });
    return toSyllabusRevisionView(row);
  }

  /** Locks the revision (a save and a confirmation never interleave); 404 outside the teacher's subjects. */
  private async lockOwned(tx: Tx, teacherId: string, revisionId: string): Promise<SyllabusRevisionStatus> {
    const [row] = await tx.$queryRaw<{ status: SyllabusRevisionStatus }[]>`
      SELECT r.status FROM syllabus_revisions r
      JOIN syllabus_documents d ON d.id = r.document_id
      JOIN subjects s ON s.id = d.subject_id
      WHERE r.id = ${revisionId}::uuid AND s.teacher_id = ${teacherId}::uuid
      FOR UPDATE OF r`;
    if (!row) throw notFound();
    return row.status;
  }
}
