import type { IntegrityEventType, IntegrityEventView, IntegrityIntervalKind, WorkHelpStatus } from "@repo/contracts";

// Texts of the controlled mode's records and of the AI help in the teacher's review (015
// contracts/web-ui.md, US4). Facts only: nothing here labels the student (FR-026).

export const RECORDS_TITLE = "Registros do modo controlado";
export const RECORDS_NOTE = "Registros de saída da tela. Uma saída não significa, sozinha, uso indevido.";
export const HELP_TITLE = "Ajuda da IA";

export const EVENT_LABELS: Record<IntegrityEventType, string> = {
  SCREEN_LEFT: "Saiu da tela",
  SCREEN_RETURNED: "Voltou à tela",
  FULLSCREEN_EXITED: "Saiu da tela cheia",
  FULLSCREEN_ENTERED: "Voltou à tela cheia",
  PAGE_LEAVE_ATTEMPTED: "Tentou sair da página",
  CONNECTION_LOST: "Conexão perdida",
  CONNECTION_RESTORED: "Conexão restabelecida",
  PASTE_BLOCKED: "Colar bloqueado",
  COPY_BLOCKED: "Copiar bloqueado",
  CUT_BLOCKED: "Recortar bloqueado",
  DROP_BLOCKED: "Arrastar texto bloqueado",
  TYPING_LIMIT_EXCEEDED: "Trecho não salvo pelo limite de digitação",
  FULLSCREEN_UNAVAILABLE: "Tela cheia indisponível",
  DETECTION_UNAVAILABLE: "Registro de saídas indisponível neste navegador",
};

/** The exit events, whose duration comes from the derived intervals. */
export const EXIT_KINDS: Partial<Record<IntegrityEventType, IntegrityIntervalKind>> = {
  SCREEN_LEFT: "SCREEN",
  FULLSCREEN_EXITED: "FULLSCREEN",
  CONNECTION_LOST: "CONNECTION",
};

/** What the teacher reads of a request's status (contracts/web-ui.md). */
export const HELP_STATUS_LABELS: Record<WorkHelpStatus, string> = {
  REQUESTED: "Aguardando a IA",
  DELIVERED: "Entregue",
  OUT_OF_SCOPE: "Fora do assunto",
  BLOCKED: "Bloqueada pela verificação",
  FAILED: "Falhou",
};

/** When an event happened, as the API derives it: the browser's time only for a buffered event, never later than the server's. */
export function occurredAt(event: IntegrityEventView): string {
  if (!event.buffered || event.clientOccurredAt === null) return event.recordedAt;
  return Date.parse(event.clientOccurredAt) < Date.parse(event.recordedAt) ? event.clientOccurredAt : event.recordedAt;
}

/** "45 s", "2 min", "2 min 5 s", "1 h 3 min". */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${rest} s`;
}

/** "n de 3" (FR-024). */
export const helpsUsedLabel = (used: number, allowance: number) => `${used} de ${allowance}`;
