import type { RoomStatus } from "@repo/contracts";

// Texts and rules of the attendance (016 contracts/web-ui.md, "Chamada").

/** The room and the student's pages are read again this often, only while the page is visible (research M8). */
export const ATTENDANCE_POLL_MS = 5_000;

export const ATTENDANCE_TITLE = "Chamada";
export const MARK_ALL = "Marcar todos";
export const UNMARK_ALL = "Desmarcar todos";
export const RELEASE_TO_PRESENT = "Liberar para os presentes";
/** The room panel's row actions (US2): release to a late student, undo a mistaken mark before the start. */
export const MARK_PRESENT = "Marcar presente";
export const UNMARK = "Desmarcar";
export const NO_STUDENTS = "Nenhum aluno matriculado nesta turma.";
export const ATTENDANCE_HINT = "Marque os alunos que estão em sala. Só eles veem o trabalho.";

/** "n de m selecionados" while the teacher takes the attendance. */
export const selectedLabel = (selected: number, total: number) => `${selected} de ${total} selecionados`;

/** "Liberar o trabalho para n alunos?" (the confirmation). */
export const releaseQuestion = (count: number) => (count === 1 ? "Liberar o trabalho para 1 aluno?" : `Liberar o trabalho para ${count} alunos?`);

/** The activity's attendance in words (016/FR-006): never by colour alone. */
export const attendanceSummary = (attendance: { present: number; enrolled: number }) =>
  attendance.present === 0 ? "Aguardando chamada" : `${attendance.present} de ${attendance.enrolled} presentes`;

/** Each student's situation in the room, as the badge says it (FR-020). */
export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  NOT_MARKED: "Não marcado",
  PRESENT: "Presente",
  ANSWERING: "Respondendo",
  OUT_OF_ROOM: "Fora da sala",
  SUBMITTED: "Entregou",
};

/**
 * The batch of the checklist: only the differences from what the server has (research M5), so two
 * teacher tabs never undo each other's marks. Null when nothing changed.
 */
export function attendanceDelta(marked: ReadonlySet<string>, selected: ReadonlySet<string>): { mark: string[]; unmark: string[] } | null {
  const mark = [...selected].filter((id) => !marked.has(id));
  const unmark = [...marked].filter((id) => !selected.has(id));
  return mark.length + unmark.length === 0 ? null : { mark, unmark };
}
