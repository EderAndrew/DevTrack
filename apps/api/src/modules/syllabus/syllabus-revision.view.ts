import type { SyllabusRevisionView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";

/** Groups and items in their positions. */
export const SYLLABUS_REVISION_VIEW_SELECT = {
  id: true,
  documentId: true,
  number: true,
  status: true,
  source: true,
  title: true,
  syllabusText: true,
  competencyText: true,
  confirmedAt: true,
  groups: {
    select: {
      id: true,
      position: true,
      title: true,
      items: { select: { id: true, position: true, text: true }, orderBy: { position: "asc" } },
    },
    orderBy: { position: "asc" },
  },
} as const satisfies Prisma.SyllabusRevisionSelect;

export type SyllabusRevisionViewRow = Prisma.SyllabusRevisionGetPayload<{ select: typeof SYLLABUS_REVISION_VIEW_SELECT }>;

export function toSyllabusRevisionView(row: SyllabusRevisionViewRow): SyllabusRevisionView {
  return {
    id: row.id,
    documentId: row.documentId,
    number: row.number,
    status: row.status,
    source: row.source,
    title: row.title,
    syllabusText: row.syllabusText,
    competencyText: row.competencyText,
    groups: row.groups,
    itemCount: row.groups.reduce((sum, group) => sum + group.items.length, 0),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}
