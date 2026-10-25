import type { AdminFeedback, AdminFeedbackListItem } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";
import { excerpt } from "../excerpt";

// What the ADMIN reads of a feedback (020 contracts/http-api.md, research J6): an allowlist, never
// the `submissionId`. The student's name is the student profile's display name (003), falling back
// to the account name.

const STUDENT_SELECT = { id: true, name: true, studentProfile: { select: { displayName: true } } } as const;

export const ADMIN_FEEDBACK_LIST_SELECT = {
  id: true,
  category: true,
  status: true,
  message: true,
  createdAt: true,
  student: { select: STUDENT_SELECT },
} as const satisfies Prisma.StudentFeedbackSelect;

export const ADMIN_FEEDBACK_SELECT = {
  id: true,
  category: true,
  status: true,
  message: true,
  originPath: true,
  createdAt: true,
  statusChangedAt: true,
  student: { select: { ...STUDENT_SELECT, email: true } },
  statusChanges: {
    select: { fromStatus: true, toStatus: true, changedAt: true, changedBy: { select: { id: true, name: true } } },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.StudentFeedbackSelect;

type ListRow = Prisma.StudentFeedbackGetPayload<{ select: typeof ADMIN_FEEDBACK_LIST_SELECT }>;
type DetailRow = Prisma.StudentFeedbackGetPayload<{ select: typeof ADMIN_FEEDBACK_SELECT }>;

const studentName = (student: ListRow["student"]) => student.studentProfile?.displayName ?? student.name;

export function toAdminFeedbackListItem(row: ListRow): AdminFeedbackListItem {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    excerpt: excerpt(row.message),
    student: { id: row.student.id, name: studentName(row.student) },
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAdminFeedback(row: DetailRow): AdminFeedback {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    message: row.message,
    originPath: row.originPath,
    student: { id: row.student.id, name: studentName(row.student), email: row.student.email },
    createdAt: row.createdAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
    history: row.statusChanges.map((change) => ({
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      changedBy: { id: change.changedBy.id, name: change.changedBy.name },
      changedAt: change.changedAt.toISOString(),
    })),
  };
}
