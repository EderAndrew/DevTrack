import type { SubjectView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";

/** Every column the view needs plus the number of classes (offerings) and syllabus versions. */
export const SUBJECT_VIEW_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  searchKey: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { classes: true, syllabusDocuments: true } },
} as const satisfies Prisma.SubjectSelect;

export type SubjectViewRow = Prisma.SubjectGetPayload<{ select: typeof SUBJECT_VIEW_SELECT }>;

/** `SubjectView` of the contract; dates as ISO (002 S4). The teacher is implied by the session. */
export function toSubjectView(row: SubjectViewRow): SubjectView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    classCount: row._count.classes,
    documentCount: row._count.syllabusDocuments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
