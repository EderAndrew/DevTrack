// 025 contracts/ui.md, "Student — exam page (web)": the warning's fixed words live only here (FR-017).

/** Never "Aviso", which is the 018 "Aviso n de 3". */
export const NUDGE_TITLE = "Mensagem do professor";

/** The fixed text with the student's own name from the server (FR-008, FR-009). */
export const nudgeText = (studentName: string) =>
  `${studentName}, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.`;

export const NUDGE_ACKNOWLEDGE = "Entendi";

/** A dismissal the server did not answer is sent again this often and when the browser is back online (015 back-off). */
export const DISMISS_RETRY_MS = 5_000;
