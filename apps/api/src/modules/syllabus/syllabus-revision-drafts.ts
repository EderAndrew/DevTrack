import type { SyllabusRevisionSource } from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";

// The writes of a syllabus draft, shared by the 004 revisions service and the 007 application of
// a proposal (007 research C10). The caller holds the document's row lock and has checked the
// draft slot (one DRAFT per document) and the content's limits.

/** Content of a draft: groups in order, each with its items in order. */
export interface DraftContent {
  title: string | null;
  syllabusText: string | null;
  competencyText: string | null;
  /** The syllabus' programming language (010/FR-039). */
  languageId: string | null;
  groups: { title: string | null; items: { text: string; originItemId: string | null }[] }[];
}

/** Where a draft comes from; `aiProposalId` iff `AI_ASSISTED`, `basedOnRevisionId` iff `REVISION` (checks in the schema). */
export interface DraftOrigin {
  source: SyllabusRevisionSource;
  basedOnRevisionId?: string | null;
  aiProposalId?: string | null;
}

/** A new DRAFT with the next number of the document. */
export async function createDraft(tx: Tx, documentId: string, origin: DraftOrigin, content: DraftContent): Promise<{ id: string; number: number }> {
  const last = await tx.syllabusRevision.aggregate({ where: { documentId }, _max: { number: true } });
  const revision = await tx.syllabusRevision.create({
    data: {
      documentId,
      number: (last._max.number ?? 0) + 1,
      status: "DRAFT",
      source: origin.source,
      basedOnRevisionId: origin.basedOnRevisionId ?? null,
      aiProposalId: origin.aiProposalId ?? null,
      title: content.title,
      syllabusText: content.syllabusText,
      competencyText: content.competencyText,
      languageId: content.languageId,
    },
    select: { id: true, number: true },
  });
  await writeGroups(tx, revision.id, content.groups);
  return revision;
}

/**
 * Replaces the whole content of a DRAFT (004 FR-021): its groups and items are deleted and written
 * again in order. With `origin`, the draft's origin changes too (a proposal rewriting it, 007 FR-032).
 */
export async function rewriteDraft(tx: Tx, revisionId: string, content: DraftContent, origin?: DraftOrigin): Promise<void> {
  await tx.syllabusItem.deleteMany({ where: { revisionId } });
  await tx.syllabusGroup.deleteMany({ where: { revisionId } });
  await tx.syllabusRevision.update({
    where: { id: revisionId },
    data: {
      title: content.title,
      syllabusText: content.syllabusText,
      competencyText: content.competencyText,
      languageId: content.languageId,
      ...(origin
        ? { source: origin.source, basedOnRevisionId: origin.basedOnRevisionId ?? null, aiProposalId: origin.aiProposalId ?? null }
        : {}),
    },
  });
  await writeGroups(tx, revisionId, content.groups);
}

async function writeGroups(tx: Tx, revisionId: string, groups: DraftContent["groups"]): Promise<void> {
  if (groups.length === 0) return;
  const created = await tx.syllabusGroup.createManyAndReturn({
    data: groups.map((group, index) => ({ revisionId, position: index + 1, title: group.title })),
    select: { id: true, position: true },
  });
  const idByPosition = new Map(created.map((group) => [group.position, group.id]));
  const items = groups.flatMap((group, groupIndex) =>
    group.items.map((item, itemIndex) => ({
      revisionId,
      groupId: idByPosition.get(groupIndex + 1)!,
      position: itemIndex + 1,
      text: item.text,
      originItemId: item.originItemId,
    })),
  );
  if (items.length > 0) await tx.syllabusItem.createMany({ data: items });
}
