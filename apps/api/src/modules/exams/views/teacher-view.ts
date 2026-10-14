import { centsToGrade, type ExamQuestionTeacherView, type TeacherExam } from "@repo/contracts";
import { byPosition, workQuestionType } from "../../works/types";
import { examWarnings } from "../exam-rules";
import type { ExamQuestionRecord, ExamRecord } from "../types";

function toTeacherQuestion(question: ExamQuestionRecord): ExamQuestionTeacherView {
  return {
    id: question.id,
    position: question.position,
    type: question.type,
    gradingStrategy: question.gradingStrategy,
    value: centsToGrade(question.valueCents),
    difficulty: question.difficulty,
    statement: question.statement,
    explanation: question.explanation,
    topicIds: [...question.topicItemIds],
    isTrickQuestion: question.isTrickQuestion,
    ...workQuestionType(question.type).teacherFields(question),
  };
}

/** Everything about an exam, for its owner only, with its answer keys and the computed warnings. */
export function toTeacherExam(record: ExamRecord): TeacherExam {
  return {
    id: record.id,
    subject: { id: record.subject.id, name: record.subject.name },
    syllabusRevisionId: record.syllabusRevisionId,
    topics: record.topics.map(({ syllabusItemId, itemText, groupTitle }) => ({ syllabusItemId, itemText, groupTitle })),
    title: record.title,
    description: record.description,
    totalGrade: centsToGrade(record.totalGradeCents),
    questionCount: record.questionCount,
    origin: record.origin,
    status: record.status,
    archivedFromStatus: record.archivedFromStatus,
    version: record.version,
    humanReviewed: record.humanReviewed,
    humanEdited: record.humanEdited,
    reviewedBy: record.reviewedBy ? { name: record.reviewedBy.name } : null,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    generationRequestId: record.generationRequestId,
    warnings: examWarnings(record.questions),
    questions: byPosition(record.questions).map(toTeacherQuestion),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
