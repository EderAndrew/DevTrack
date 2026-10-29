// The teacher's words for a student's runs in the review (021 contracts/web-ui.md "Teacher review").
// Facts for the teacher, never a grade: no code, input or output is ever shown.

export const RUN_SUMMARY_TITLE = "Execuções do aluno";
export const NO_RUNS = "Nenhuma execução";
export const RUN_PENDING = "Uma execução em andamento";
export const LAST_COMPILATION_ERROR = "Última execução: erro de compilação";
export const LAST_FAILED = "Última execução: não foi possível executar";
export const RUN_SUMMARY_NOTE = "Execuções são um registro do aluno; não mudam a nota.";
export const LAST_CASES_LABEL = "Casos públicos da última execução";

/** "1 execução", "3 execuções". */
export const runCountText = (count: number) => `${count} ${count === 1 ? "execução" : "execuções"}`;

/** The region of question `position` (0-based), unique on the page. */
export const runSummaryRegionLabel = (position: number) => `${RUN_SUMMARY_TITLE} na questão ${position + 1}`;
