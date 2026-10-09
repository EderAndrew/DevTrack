import type { AiErrorCode, StudentHelpItem, TeacherHelpItem, WorkHelpBlockReason, WorkHelpStatus } from "@repo/contracts";

/** A help request as the views read it. */
export interface HelpRequestRow {
  id: string;
  questionId: string;
  question: string;
  status: WorkHelpStatus;
  message: string | null;
  exampleCode: string | null;
  reasonCode: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
}

export const HELP_REQUEST_SELECT = {
  id: true,
  questionId: true,
  question: true,
  status: true,
  message: true,
  exampleCode: true,
  reasonCode: true,
  requestedAt: true,
  resolvedAt: true,
} as const;

/** Text only where the student may read it (FR-019, FR-022): an orientation or an out-of-scope reply. */
const readable = (status: WorkHelpStatus) => status === "DELIVERED" || status === "OUT_OF_SCOPE";

/**
 * The student's item (015 research F13), by allowlist: BLOCKED and FAILED carry no text and no
 * reason; never the execution id, the answer key or the identity.
 */
export function toStudentHelpItem(row: HelpRequestRow): StudentHelpItem {
  return {
    id: row.id,
    questionId: row.questionId,
    question: row.question,
    status: row.status,
    message: readable(row.status) ? row.message : null,
    example: row.status === "DELIVERED" && row.exampleCode !== null ? { code: row.exampleCode } : null,
    requestedAt: row.requestedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

/** The teacher's item (FR-025): the student's item, the question's position and why it was blocked or failed. */
export function toTeacherHelpItem(row: HelpRequestRow & { questionPosition: number }): TeacherHelpItem {
  const { questionId: _questionId, ...student } = toStudentHelpItem(row);
  return {
    ...student,
    questionPosition: row.questionPosition,
    reasonCode: row.status === "BLOCKED" || row.status === "FAILED" ? (row.reasonCode as WorkHelpBlockReason | AiErrorCode | null) : null,
  };
}
