import type { StudentFeedback } from "@repo/contracts";
import type { Prisma } from "../../../generated/prisma/client";

// What a student reads of their own feedback (020 contracts/http-api.md, research J6): an allowlist,
// never the history, who changed the status, `statusChangedAt`, the origin path or the submission id.

export const STUDENT_FEEDBACK_SELECT = {
  id: true,
  category: true,
  message: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.StudentFeedbackSelect;

export type StudentFeedbackRow = Prisma.StudentFeedbackGetPayload<{ select: typeof STUDENT_FEEDBACK_SELECT }>;

export function toStudentFeedback(row: StudentFeedbackRow): StudentFeedback {
  return {
    id: row.id,
    category: row.category,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
