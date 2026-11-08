import { EXAM_WARNINGS, type ExamAlertKind, type ExamAlertPushData } from "@repo/contracts";

/**
 * The text of an alert (024 contracts/push-notifications.md, "Message"): what happened, to whom, in which
 * exam — never a statement, an answer, a grade, an e-mail, an RA or contact data (FR-016), and never
 * "fraude", "cola" or "violação" (FR-022). Names and titles are plain text. Pure; built at send time and
 * never stored. The Android channel hides it on a locked phone (research Y7).
 */
export interface AlertFacts {
  kind: ExamAlertKind;
  occurrenceOrdinal: number;
  studentName: string;
  examTitle: string;
  className: string;
  classId: string;
  activityId: string;
  studentUserId: string;
}

export interface AlertMessage {
  channelId: "exam-occurrences" | "exam-holds";
  title: string;
  body: string;
  data: ExamAlertPushData;
  priority: "high";
  sound: "default";
}

export const OCCURRENCE_TITLE = "Ocorrência na prova";
export const HOLD_TITLE = "Prova retida — decisão pendente";

export function alertMessage(facts: AlertFacts): AlertMessage {
  const exam = `${facts.examTitle} (${facts.className})`;
  const hold = facts.kind === "HOLD";
  const what = facts.occurrenceOrdinal <= EXAM_WARNINGS ? `Aviso ${facts.occurrenceOrdinal} de ${EXAM_WARNINGS}` : "Nova ocorrência";
  return {
    channelId: hold ? "exam-holds" : "exam-occurrences",
    title: hold ? HOLD_TITLE : OCCURRENCE_TITLE,
    body: hold ? `${facts.studentName} — ${exam}` : `${facts.studentName} — ${what} — ${exam}`,
    data: { kind: facts.kind, classId: facts.classId, activityId: facts.activityId, studentUserId: facts.studentUserId },
    priority: "high",
    sound: "default",
  };
}
