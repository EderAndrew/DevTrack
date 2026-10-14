/**
 * Ids of the exam form's fields: the labels' `for` and the targets of the error summary's links.
 * Questions are numbered from 1 on screen.
 */

export type ExamHeaderField = "subjectId" | "title" | "description" | "totalGrade" | "revisionId" | "topicIds";

const HEADER_SLUGS: Record<ExamHeaderField, string> = {
  subjectId: "disciplina",
  title: "titulo",
  description: "descricao",
  totalGrade: "nota",
  revisionId: "ementa",
  topicIds: "topicos",
};

export type QuestionField =
  | "type"
  | "statement"
  | "difficulty"
  | "explanation"
  | "topicIds"
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
  difficulty: "dificuldade",
  explanation: "explicacao",
  topicIds: "topicos",
  expectedAnswer: "resposta",
  rubric: "rubrica",
  correctAlternative: "correta",
  isTrickQuestion: "pegadinha",
  instructions: "instrucoes",
  starterCode: "codigo-inicial",
  expectedSolution: "solucao",
  languageId: "linguagem",
};

export const examFieldId = (field: ExamHeaderField) => `prova-${HEADER_SLUGS[field]}`;
export const questionFieldId = (question: number, field: QuestionField) => `questao-${question + 1}-${QUESTION_SLUGS[field]}`;
export const questionCardId = (question: number) => `questao-${question + 1}`;
export const alternativeFieldId = (question: number, alternative: number) => `questao-${question + 1}-alternativa-${alternative + 1}`;
export const correctRadioId = (question: number, alternative: number) => `${alternativeFieldId(question, alternative)}-correta`;
export const alternativesErrorId = (question: number) => `questao-${question + 1}-alternativas-erro`;
export const testCaseFieldId = (question: number, testCase: number, field: "input" | "expectedOutput" | "visibility") =>
  `questao-${question + 1}-caso-${testCase + 1}-${{ input: "entrada", expectedOutput: "saida", visibility: "visibilidade" }[field]}`;
/** The first checkbox of a group of topics, where the error summary sends the focus. */
export const topicCheckboxId = (scope: string, itemId: string) => `${scope}-${itemId}`;
export const ADD_QUESTION_ID = "questao-adicionar";
