import { centsToGrade, type ExamStudentPreview, type WorkQuestionStudentView } from "@repo/contracts";
import { byPosition, workQuestionType } from "../../works/types";
import type { ExamQuestionRecord, ExamRecord } from "../types";

function toStudentQuestion(question: ExamQuestionRecord): WorkQuestionStudentView {
  return {
    id: question.id,
    position: question.position,
    type: question.type,
    value: centsToGrade(question.valueCents),
    statement: question.statement,
    ...workQuestionType(question.type).studentFields(question),
  };
}

/**
 * What a student may see of an exam (018/FR-029), built by copying the allowed fields one by one —
 * never by removing fields from the teacher view — so a new column (the difficulty, the topics, the
 * answer key) stays hidden until it is listed here or in its type's `studentFields`. Served only by
 * the teacher's "Ver como aluno"; the applied exam is served from the class snapshot (US3).
 */
export function toExamStudentPreview(record: ExamRecord): ExamStudentPreview {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    totalGrade: centsToGrade(record.totalGradeCents),
    questions: byPosition(record.questions).map(toStudentQuestion),
  };
}
