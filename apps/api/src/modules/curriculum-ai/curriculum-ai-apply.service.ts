import { Injectable, Logger } from "@nestjs/common";
import {
  type AiProposalView,
  type ApplyCurriculumProposalRequest,
  type ApplyCurriculumProposalResponse,
  type CurriculumExtractionOutput,
  SaveSyllabusRevisionRequestSchema,
} from "@repo/contracts";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, invalidStateTransition, notFound, revisionDraftExists, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { AiProposalsService } from "../ai/proposals/ai-proposals.service";
import { READER_VERSION } from "../syllabus/extraction/normalize";
import { createDraft, type DraftContent, rewriteDraft } from "../syllabus/syllabus-revision-drafts";
import { SYLLABUS_REVISION_VIEW_SELECT, toSyllabusRevisionView } from "../syllabus/syllabus-revision.view";
import { CURRICULUM_PROPOSAL_TYPE } from "./definitions/curriculum-agent";
import { projectAccepted } from "./proposal/item-ids";

/** The accepted fields counted as such in the audit; the language (010) is one of them. */
const FIELDS = ["title", "syllabusText", "competencyText", "language"] as const;

/**
 * The stored payload, read without the output schema's limits: the 004 draft schema decides what
 * can be applied (FR-036), so content that no longer fits is a 422 on the fields accepted, and the
 * teacher can still apply the rest.
 */
const StoredContentSchema = z.object({
  extraction: z.object({
    title: z.string().nullable(),
    syllabusText: z.string().nullable(),
    competencyText: z.string().nullable(),
    groups: z.array(z.object({ title: z.string().nullable(), items: z.array(z.object({ text: z.string() })) })),
  }),
  /** 010: absent on proposals made before the language. */
  language: z.object({ key: z.string() }).nullable().optional(),
  grounding: z.object({
    unsupported: z.array(z.object({ field: z.string(), groupIndex: z.number().nullable() })),
  }),
  source: z.object({ sha256: z.string(), readerVersion: z.unknown() }),
});

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item) => b.includes(item));

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * "Aplicar à ementa" (007 US3, research C10): the accepted fields and groups of a proposal become
 * the document's 004 draft, and the proposal is approved, in one transaction. A failed domain
 * check leaves the proposal READY_FOR_REVIEW and writes nothing. Logs carry only ids and counts.
 */
@Injectable()
export class CurriculumAiApplyService {
  private readonly logger = new Logger("CurriculumAi");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly proposals: AiProposalsService,
  ) {}

  async apply(
    auth: AuthContext,
    documentId: string,
    proposalId: string,
    body: ApplyCurriculumProposalRequest,
    requestId: string | null,
  ): Promise<ApplyCurriculumProposalResponse> {
    await this.proposals.assertDecisionRate(auth, requestId);
    const run = () => this.prisma.runInTransaction((tx) => this.applyWithin(tx, auth, documentId, proposalId, body, requestId));
    try {
      return await run();
    } catch (error) {
      // A concurrent application won the `UNIQUE (ai_proposal_id)`: this one is now the replay.
      if (isUniqueViolation(error)) return run();
      throw error;
    }
  }

  private async applyWithin(
    tx: Tx,
    auth: AuthContext,
    documentId: string,
    proposalId: string,
    body: ApplyCurriculumProposalRequest,
    requestId: string | null,
  ): Promise<ApplyCurriculumProposalResponse> {
    const now = new Date();
    // 1. The document, locked: applications and 004 drafts of one document never interleave.
    const [document] = await tx.$queryRaw<{ sha256: Uint8Array }[]>`
      SELECT d.sha256 FROM syllabus_documents d
      JOIN subjects s ON s.id = d.subject_id
      WHERE d.id = ${documentId}::uuid AND s.teacher_id = ${auth.userId}::uuid
      FOR UPDATE OF d`;
    if (!document) throw notFound();

    // 2. The proposal, locked, of this type and for this document.
    const proposal = await this.proposals.getForUpdate(tx, auth.userId, proposalId);
    if (proposal.proposalType !== CURRICULUM_PROPOSAL_TYPE || proposal.target.type !== "SYLLABUS_DOCUMENT" || proposal.target.id !== documentId) {
      throw notFound();
    }
    if (!body.acceptedItemIds.every((id) => proposal.itemIds.includes(id))) throw validationError();

    // 3. The analysed document is still this one.
    const content = StoredContentSchema.safeParse(proposal.content);
    if (!content.success) throw new AppException("CURRICULUM_PROPOSAL_INVALID");
    const { source, extraction, grounding, language } = content.data;
    if (source.sha256 !== Buffer.from(document.sha256).toString("hex") || source.readerVersion !== READER_VERSION) {
      throw new AppException("CURRICULUM_SOURCE_CHANGED");
    }

    // 4. Already applied: the same selection answers the same body (FR-034); anything else conflicts.
    if (proposal.status !== "READY_FOR_REVIEW") return this.replay(tx, proposal, body);
    if (new Date(proposal.expiresAt) <= now) throw invalidStateTransition();

    // 5. The accepted content, validated as a 004 draft (FR-036).
    const parsed = SaveSyllabusRevisionRequestSchema.safeParse(projectAccepted(extraction as CurriculumExtractionOutput, body.acceptedItemIds));
    if (!parsed.success) throw new AppException("CURRICULUM_PROPOSAL_INVALID");
    const languageId = body.acceptedItemIds.includes("language") ? await this.acceptedLanguage(tx, language?.key ?? null) : null;
    const draft: DraftContent = {
      title: parsed.data.title || null,
      syllabusText: parsed.data.syllabusText || null,
      competencyText: parsed.data.competencyText || null,
      languageId,
      groups: parsed.data.groups.map((group) => ({
        title: group.title || null,
        items: group.items.map((item) => ({ text: item.text, originItemId: null })),
      })),
    };

    // 6. The draft slot: one DRAFT per document; a confirmed revision is never touched (FR-032, FR-033).
    // The draft row is locked too: a 004 confirmation holds it, so the application waits for it
    // and, the row no longer matching `status = 'DRAFT'`, starts the next draft instead.
    const origin = { source: "AI_ASSISTED" as const, aiProposalId: proposalId };
    const [existing] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM syllabus_revisions
      WHERE document_id = ${documentId}::uuid AND status = 'DRAFT'
      FOR UPDATE`;
    if (existing && !body.replaceDraft) throw revisionDraftExists();
    let revisionId: string;
    if (existing) {
      await rewriteDraft(tx, existing.id, draft, origin);
      revisionId = existing.id;
    } else {
      revisionId = (await createDraft(tx, documentId, origin, draft)).id;
    }

    // 7. The decision of the foundation, then the domain's audit, in this transaction.
    const all = sameSet(body.acceptedItemIds, proposal.itemIds);
    const decided = await this.proposals.decideWithin(
      tx,
      auth,
      proposalId,
      all ? { decision: "APPROVE" } : { decision: "APPROVE_PARTIALLY", acceptedItemIds: body.acceptedItemIds },
      requestId,
      now,
    );
    const revision = toSyllabusRevisionView(
      await tx.syllabusRevision.findUniqueOrThrow({ where: { id: revisionId }, select: SYLLABUS_REVISION_VIEW_SELECT }),
    );
    const accepted = new Set(body.acceptedItemIds);
    const counts = {
      acceptedFields: FIELDS.filter((field) => accepted.has(field)).length,
      acceptedGroups: body.acceptedItemIds.length - FIELDS.filter((field) => accepted.has(field)).length,
      groupCount: revision.groups.length,
      itemCount: revision.itemCount,
      unsupportedCount: grounding.unsupported.filter((flag) =>
        flag.groupIndex === null ? accepted.has(flag.field) : accepted.has(`group:${flag.groupIndex}`),
      ).length,
    };
    await this.audit.record(tx, {
      type: "curriculum_ai.proposal_applied",
      actorType: "USER",
      actorUserId: auth.userId,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: documentId,
      requestId,
      metadata: { proposalId, revisionId, revisionNumber: revision.number, replacedDraft: existing !== undefined, ...counts },
    });
    this.logger.log({ documentId, proposalId, revisionId, replacedDraft: existing !== undefined, ...counts }, "curriculum proposal applied");
    return { revision, proposal: decided };
  }

  /**
   * The id of the accepted language (010/FR-041): it must still be an active catalog entry, else
   * the field can't be applied (422, as any accepted content that no longer fits).
   */
  private async acceptedLanguage(tx: Tx, key: string | null): Promise<string> {
    const entry = key === null ? null : await tx.programmingLanguage.findFirst({ where: { key, active: true }, select: { id: true } });
    if (!entry) throw new AppException("CURRICULUM_PROPOSAL_INVALID");
    return entry.id;
  }

  /** The answer of an application already made, when the selection is the same one (FR-034). */
  private async replay(tx: Tx, proposal: AiProposalView, body: ApplyCurriculumProposalRequest): Promise<ApplyCurriculumProposalResponse> {
    const accepted = proposal.status === "APPROVED" ? proposal.itemIds : proposal.status === "PARTIALLY_APPROVED" ? proposal.acceptedItemIds : null;
    const row = accepted && sameSet(accepted, body.acceptedItemIds)
      ? await tx.syllabusRevision.findUnique({ where: { aiProposalId: proposal.id }, select: SYLLABUS_REVISION_VIEW_SELECT })
      : null;
    if (!row) throw invalidStateTransition();
    return { revision: toSyllabusRevisionView(row), proposal };
  }
}
