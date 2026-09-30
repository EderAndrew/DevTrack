import { centsToGrade, type WorkQuestionStudentView, type WorkStudentView } from "@repo/contracts";
import { byPosition, type WorkQuestionRecord, type WorkRecord, workQuestionType } from "../types";

function toStudentQuestion(question: WorkQuestionRecord): WorkQuestionStudentView {
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
 * What a student may see of a work (011/FR-033, research W14), built by copying the allowed
 * fields one by one — never by removing fields from the teacher view — so a new column stays
 * hidden from students until it is listed here or in its type. Served in 011 only by the teacher's
 * "Ver como aluno"; 012 serves the same builder to students.
 */
export function toWorkStudentView(record: WorkRecord): WorkStudentView {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    totalGrade: centsToGrade(record.totalGradeCents),
    questions: byPosition(record.questions).map(toStudentQuestion),
  };
}
