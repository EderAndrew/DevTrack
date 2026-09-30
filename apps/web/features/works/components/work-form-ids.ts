/**
 * Ids of the work form's fields: the labels' `for` and the targets of the error summary's links.
 * Questions are numbered from 1 on screen.
 */

export type WorkHeaderField =
  | "subjectId"
  | "title"
  | "description"
  | "totalGrade"
  | "difficulty"
  | "revisionId"
  | "topicItemIds";

const HEADER_SLUGS: Record<WorkHeaderField, string> = {
  subjectId: "disciplina",
  title: "titulo",
  description: "descricao",
  totalGrade: "nota",
  difficulty: "dificuldade",
  revisionId: "ementa",
  topicItemIds: "topicos",
};

export type QuestionField =
  | "type"
  | "statement"
  | "explanation"
  | "topicItemIds"
  | "expectedAnswer"
  | "rubric"
  | "correctAlternative"
  | "isTrickQuestion"
  | "instructions"
  | "starterCode"
  | "expectedSolution"
  | "languageId";

const QUESTION_SLUGS: Record<QuestionField, string> = {
  type: "tipo",
  statement: "enunciado",
  explanation: "explicacao",
  topicItemIds: "topicos",
  expectedAnswer: "resposta",
  rubric: "rubrica",
  correctAlternative: "correta",
  isTrickQuestion: "pegadinha",
  instructions: "instrucoes",
  starterCode: "codigo-inicial",
  expectedSolution: "solucao",
  languageId: "linguagem",
};

export const workFieldId = (field: WorkHeaderField) =>
  `trabalho-${HEADER_SLUGS[field]}`;
export const questionFieldId = (question: number, field: QuestionField) =>
  `questao-${question + 1}-${QUESTION_SLUGS[field]}`;
export const alternativeFieldId = (question: number, alternative: number) =>
  `questao-${question + 1}-alternativa-${alternative + 1}`;
export const correctRadioId = (question: number, alternative: number) =>
  `${alternativeFieldId(question, alternative)}-correta`;
export const alternativesErrorId = (question: number) =>
  `questao-${question + 1}-alternativas-erro`;
export const testCaseFieldId = (
  question: number,
  testCase: number,
  field: "input" | "expectedOutput" | "visibility",
) =>
  `questao-${question + 1}-caso-${testCase + 1}-${{ input: "entrada", expectedOutput: "saida", visibility: "visibilidade" }[field]}`;
/** The first checkbox of a group of topics, where the error summary sends the focus. */
export const topicCheckboxId = (scope: string, itemId: string) =>
  `${scope}-${itemId}`;
export const ADD_QUESTION_ID = "questao-adicionar";
