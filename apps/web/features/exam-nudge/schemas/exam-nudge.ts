import type { TeacherExamNudge } from "@repo/contracts";

// 025 contracts/ui.md, "Student — exam page (web)": the warning's fixed words live only here (FR-017).

/** Never "Aviso", which is the 018 "Aviso n de 3". */
export const NUDGE_TITLE = "Mensagem do professor";

/** The fixed text with the student's own name from the server (FR-008, FR-009). */
export const nudgeText = (studentName: string) =>
  `${studentName}, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.`;

export const NUDGE_ACKNOWLEDGE = "Entendi";

/** A dismissal the server did not answer is sent again this often and when the browser is back online (015 back-off). */
export const DISMISS_RETRY_MS = 5_000;

// 025 contracts/ui.md, "Teacher — web": the warnings in the exam monitor and in the attempt's records (US3). Text
// only — the server derives the status (PENDING, DISMISSED, UNSEEN), never the browser.

/** The monitor's badge while a warning waits for the student (US3-2). */
export const NUDGE_PENDING_BADGE = "Aviso do professor pendente";

/** The monitor's count of warnings sent to the student (US3-2). */
export const nudgesSentText = (count: number) => `Avisos do professor enviados: ${count}`;

/** Every warning shown to the teacher says it is not an occurrence (US3-4); never only by colour. */
export const NOT_AN_OCCURRENCE = "Não é uma ocorrência";

export const NUDGE_SENT = "Aviso do professor enviado";
export const NUDGE_DISMISSED = "Aviso fechado pelo aluno";
export const NUDGE_WAITING = "Aguardando o aluno";
export const NUDGE_UNSEEN = "Não visto";

/** One warning of the timeline in words (US3-1, US3-3): when it was sent, then its outcome with the server's times. */
export function nudgeEntry(
  nudge: Pick<TeacherExamNudge, "sentAt" | "dismissedAt" | "status">,
  time: (iso: string) => string,
): { sent: string; outcome: string } {
  const sent = `${NUDGE_SENT} — ${time(nudge.sentAt)}`;
  if (nudge.status === "DISMISSED" && nudge.dismissedAt) return { sent, outcome: `${NUDGE_DISMISSED} — ${time(nudge.dismissedAt)}` };
  return { sent, outcome: nudge.status === "UNSEEN" ? NUDGE_UNSEEN : NUDGE_WAITING };
}
