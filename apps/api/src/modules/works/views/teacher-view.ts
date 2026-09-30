import { centsToGrade, type WorkQuestionTeacherView, type WorkTeacherView } from "@repo/contracts";
import { workWarnings } from "../rules/work-rules";
import { byPosition, type WorkQuestionRecord, type WorkRecord, workQuestionType } from "../types";

function toTeacherQuestion(question: WorkQuestionRecord): WorkQuestionTeacherView {
  return {
    id: question.id,
    position: question.position,
    type: question.type,
    gradingStrategy: question.gradingStrategy,
    value: centsToGrade(question.valueCents),
    statement: question.statement,
    explanation: question.explanation,
    topicItemIds: [...question.topicItemIds],
    isTrickQuestion: question.isTrickQuestion,
    ...workQuestionType(question.type).teacherFields(question),
  };
}

/** Everything about a work, for its owner (011 research W14), with the computed warnings. */
export function toWorkTeacherView(record: WorkRecord): WorkTeacherView {
  return {
    id: record.id,
    subject: { id: record.subject.id, name: record.subject.name },
    syllabusRevisionId: record.syllabusRevisionId,
    topics: record.topics.map(({ syllabusItemId, itemText, groupTitle }) => ({ syllabusItemId, itemText, groupTitle })),
    title: record.title,
    description: record.description,
    difficulty: record.difficulty,
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
    warnings: workWarnings(record.questions),
    questions: byPosition(record.questions).map(toTeacherQuestion),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
