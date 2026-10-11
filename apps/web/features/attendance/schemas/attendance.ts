import type { PauseInitiator, PauseReason, RoomStatus, StudentPauseReason } from "@repo/contracts";
import { formatTime } from "@/lib/messages/dates";

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

// ── 016/US3: "Sair da sala", the pause notice and the release (contracts/web-ui.md) ──────────

/** Each reason as the student and the teacher read it (FR-011, FR-016). */
export const PAUSE_REASON_LABELS: Record<PauseReason, string> = {
  BATHROOM: "Ir ao banheiro",
  WATER: "Beber água",
  PHONE: "Atender o telefone",
  OTHER: "Outro",
  TEACHER: "Pausado pelo professor",
};
/** The closed list of the exit dialog, in this order. */
export const STUDENT_PAUSE_REASONS: readonly StudentPauseReason[] = ["BATHROOM", "WATER", "PHONE", "OTHER"];
/** The optional text of "Outro" (the contract's `PAUSE_NOTE_MAX`). */
export const PAUSE_NOTE_MAX_LENGTH = 200;

export const EXIT_ROOM = "Sair da sala";
export const EXIT_ROOM_REASONS = "Por que você vai sair?";
export const EXIT_ROOM_NOTICE = "A atividade ficará pausada até o professor liberar o seu retorno. O prazo continua correndo.";
export const EXIT_NOTE_LABEL = "Motivo (opcional, sem dados pessoais)";
export const CONFIRM_EXIT = "Confirmar saída";
export const EXIT_OFFLINE = "Sem conexão. Avise o professor antes de sair.";

export const PAUSED_TITLE = "Atividade pausada";
export const PAUSED_TEXT = "Ao voltar, peça ao professor para liberar o seu retorno.";
export const RETURN_RELEASED = "Retorno liberado";
export const RESUME = "Retomar";
/** CONTROLLED (015): fullscreen comes back only from the student's own gesture (research M10). */
export const RESUME_CONTROLLED = "Retomar em modo controlado";

/** The teacher's action on a student out of the room (FR-014). */
export const RELEASE_RETURN = "Liberar retorno";

/** "Saída às HH:MM", on the student's notice. */
export const exitedAtLabel = (startedAt: string) => `Saída às ${formatTime(startedAt)}`;

/** "Fora da sala — Ir ao banheiro, desde 10:42", on the teacher's room (FR-020). */
export const outOfRoomLabel = (reason: PauseReason, startedAt: string) => `Fora da sala — ${PAUSE_REASON_LABELS[reason]}, desde ${formatTime(startedAt)}`;

/** Time away so far, in whole minutes ("há 3 min"); under a minute, "agora há pouco". */
export const awayForLabel = (seconds: number) => (seconds < 60 ? "agora há pouco" : `há ${Math.floor(seconds / 60)} min`);

// ── 016/US4: attendance and pauses when grading, and in the student's history (contracts/web-ui.md) ──

export const PRESENCE_COLUMN = "Presença";
export const PAUSES_COLUMN = "Pausas";
export const OUT_OF_ROOM = "Fora da sala";
export const ROOM_EXITS_TITLE = "Saídas da sala";
export const NO_ROOM_EXITS = "Nenhuma saída da sala nesta tentativa.";
/** A pause still open when the activity was closed or cancelled ends with it (research M7). */
export const ENDED_WITH_ACTIVITY = "Encerrada com a atividade";
/** A pause still open when the teacher accepted the saved attempt (012 FR-006b). */
export const ENDED_WITH_ACCEPTANCE = "Encerrada com a aceitação da entrega";
export const NO_RETURN = "sem retorno registrado";

/** Who started the pause (FR-021): the student's declared exit or the teacher's pause. */
export const PAUSE_INITIATOR_LABELS: Record<PauseInitiator, string> = {
  STUDENT: "Aluno",
  TEACHER: "Professor",
};

/** "Outro: <texto>" in the teacher's review; the reason alone otherwise. */
export const pauseReasonText = (pause: { reason: PauseReason; note: string | null }) =>
  pause.note ? `${PAUSE_REASON_LABELS[pause.reason]}: ${pause.note}` : PAUSE_REASON_LABELS[pause.reason];
