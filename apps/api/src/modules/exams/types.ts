import type { ExamOrigin, ExamQuestionEdit, ExamStatus, GradeCents, WorkDifficulty, WorkTopicView } from "@repo/contracts";
import type { AnyWorkQuestionInput, WorkQuestionRecord } from "../works/types";

/**
 * An exam question as read from the database: the 011 question record (so the work bank's type
 * registry builds its views and checks its key) plus its difficulty. `topicItemIds` holds the exam
 * topics the question assesses (018 research T2).
 */
export interface ExamQuestionRecord extends WorkQuestionRecord {
  difficulty: WorkDifficulty | null;
}

/** An exam as read from the database (the query layer builds it; rules and views stay pure). */
export interface ExamRecord {
  id: string;
  subject: { id: string; name: string };
  syllabusRevisionId: string;
  /** In selection order. */
  topics: WorkTopicView[];
  title: string;
  description: string | null;
  totalGradeCents: GradeCents;
  questionCount: number;
  origin: ExamOrigin;
  status: ExamStatus;
  archivedFromStatus: ExamStatus | null;
  version: number;
  humanReviewed: boolean;
  humanEdited: boolean;
  reviewedBy: { name: string } | null;
  reviewedAt: Date | null;
  generationRequestId: string | null;
  /** Any order; the views sort by position. */
  questions: ExamQuestionRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The 011 input shape of an exam question, for the work bank's type registry: the type fields are
 * the same; the exam's topics and difficulty are written by the exam's own content writer.
 */
export function asWorkQuestionInput(input: ExamQuestionEdit): AnyWorkQuestionInput {
  const { difficulty: _difficulty, topicIds, ...question } = input;
  return { ...question, topicItemIds: [...topicIds] } as AnyWorkQuestionInput;
}
