import type { ExerciseResult, MarkExerciseResultsRequest, TeacherAttempt, TeacherExerciseResult, TeacherQuestion } from "@repo/contracts";

/** The words of a result, the same the student reads (013 contracts/web-ui.md). */
export const EXERCISE_RESULT_LABELS: Record<ExerciseResult, string> = {
  CORRECT: "Certo",
  WRONG: "Errado",
  PENDING_TEACHER: "Aguardando correção",
  UNSCORED: "Compare com o gabarito",
};

export const EXERCISE_RESULT_VARIANTS: Record<ExerciseResult, "success" | "danger" | "warning" | "info"> = {
  CORRECT: "success",
  WRONG: "danger",
  PENDING_TEACHER: "warning",
  UNSCORED: "info",
};

export type MarkChoice = "CORRECT" | "WRONG";

/** Per question: the chosen result ("" while none) and the comment as typed. */
export type MarkValues = Record<string, { result: MarkChoice | ""; comment: string }>;

/** The radios of exercise `position` (0-based) share this name. */
export const markFieldName = (position: number) => `marca-exercicio-${position + 1}`;
export const commentFieldId = (position: number) => `comentario-exercicio-${position + 1}`;

/**
 * The teacher marks the scoring row of an answered open answer or code (013/FR-017): a multiple
 * choice and a blank are decided by the rule, practice and "já pontuado" rows never score. The API
 * decides the same (`422 NOT_MARKABLE`); this only chooses what to show.
 */
export const isMarkable = (row: TeacherExerciseResult, question: TeacherQuestion) =>
  row.scoring && question.type !== "MULTIPLE_CHOICE" && row.nature !== "RULE_RESULT";

/** The stored marks of the markable rows. */
export function markDefaults(attempt: TeacherAttempt, questions: readonly TeacherQuestion[]): MarkValues {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const values: MarkValues = {};
  for (const row of attempt.exercise?.results ?? []) {
    const question = byId.get(row.questionId);
    if (!question || !isMarkable(row, question)) continue;
    values[row.questionId] = { result: row.result === "CORRECT" || row.result === "WRONG" ? row.result : "", comment: row.comment ?? "" };
  }
  return values;
}

/**
 * Only the marks the teacher changed (013 research K8: the body states the absolute result): a row
 * with a result chosen whose result or comment differs from the stored one. An empty comment is no
 * comment.
 */
export function toMarkRequest(values: MarkValues, attempt: TeacherAttempt): MarkExerciseResultsRequest["marks"] {
  const marks: MarkExerciseResultsRequest["marks"] = [];
  for (const row of attempt.exercise?.results ?? []) {
    const typed = values[row.questionId];
    if (!typed || typed.result === "") continue;
    const comment = typed.comment.trim() === "" ? null : typed.comment;
    if (typed.result !== row.result || comment !== row.comment) marks.push({ questionId: row.questionId, result: typed.result, comment });
  }
  return marks;
}

/** "1 resposta aguardando correção" / "3 respostas aguardando correção". */
export const pendingMarksLabel = (count: number) =>
  count === 0 ? "Nenhuma resposta aguardando correção" : `${count} ${count === 1 ? "resposta" : "respostas"} aguardando correção`;
