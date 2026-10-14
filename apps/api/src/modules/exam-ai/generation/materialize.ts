import { centsToGrade, GeneratedExamSchema, gradeToCents, type WorkDifficulty } from "@repo/contracts";
import { derivedUuid } from "../../../platform/crypto/derived-uuid";
import type { Tx } from "../../../platform/database/transaction";
import { searchKey } from "../../../platform/text/search-key";
import type { ProposalMaterializeContext } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { writeExamContent } from "../../exams/exam-content";
import { ProposalRejected } from "./proposal-rejected";
import { EXAM_GENERATION_REQUEST } from "./request-content";
import { validateGeneratedExam } from "./validate-generated-exam";

interface LockedRequest {
  id: string;
  teacher_id: string;
  subject_id: string;
  syllabus_revision_id: string;
  title: string;
  difficulty: WorkDifficulty;
  total_grade: string;
  requested_quantity: number;
  open_answer_quantity: number;
  multiple_choice_quantity: number;
  code_quantity: number;
  trick_question_quantity: number;
  language_id: string | null;
  ai_execution_id: string | null;
  generated_at: Date | null;
}

/**
 * `proposal.materialize` of `exam-generator` (018 contracts/exam-generator.md "Materialize"): in the
 * transaction that completes the execution, the request (locked) gets its DRAFT `AI_GENERATED` exam —
 * subject, revision, title and total grade from the request, its chosen topics in order, each question
 * checked again against the request's own rows with the value of its position (the 011 rule, never
 * from the output) — and `generated_at`, audited `exam_generation.completed`. Anything wrong throws and
 * the runner rolls it all back: the exam is whole or absent, and never approved (FR-006).
 */
export async function materializeGeneratedExam(tx: Tx, context: ProposalMaterializeContext): Promise<void> {
  if (context.resource?.type !== EXAM_GENERATION_REQUEST) throw new ProposalRejected("REQUEST_MISMATCH");
  const [request] = await tx.$queryRaw<LockedRequest[]>`
    SELECT id, teacher_id, subject_id, syllabus_revision_id, title, difficulty::text AS difficulty, total_grade::text AS total_grade,
           requested_quantity, open_answer_quantity, multiple_choice_quantity, code_quantity, trick_question_quantity,
           language_id, ai_execution_id, generated_at
    FROM exam_generation_requests
    WHERE id = ${context.resource.id}::uuid AND teacher_id = ${context.workspaceId}::uuid
    FOR UPDATE`;
  if (!request || request.ai_execution_id !== context.executionId || request.generated_at !== null) throw new ProposalRejected("REQUEST_MISMATCH");

  const topics = await tx.examGenerationRequestTopic.findMany({ where: { requestId: request.id }, select: { syllabusItemId: true }, orderBy: { position: "asc" } });
  // The proposal keeps only the questions (`build`); the title is the request's.
  const { questions } = GeneratedExamSchema.pick({ questions: true }).parse(context.content);
  const inputs = validateGeneratedExam(
    { title: request.title, questions },
    {
      topics: topics.map((topic) => ({ id: topic.syllabusItemId, itemText: "", groupTitle: null })),
      request: {
        difficulty: request.difficulty,
        quantity: request.requested_quantity,
        counts: { OPEN_ANSWER: request.open_answer_quantity, MULTIPLE_CHOICE: request.multiple_choice_quantity, CODE: request.code_quantity },
        trickCount: request.trick_question_quantity,
        language: request.language_id ? { id: request.language_id, name: "" } : null,
      },
    },
  );
  if (request.language_id && request.code_quantity > 0) {
    const active = await tx.programmingLanguage.count({ where: { id: request.language_id, active: true } });
    if (active === 0) throw new ProposalRejected("LANGUAGE_INACTIVE");
  }

  const totalCents = gradeToCents(request.total_grade);
  const { id: examId } = await tx.exam.create({
    data: {
      teacherId: request.teacher_id,
      subjectId: request.subject_id,
      syllabusRevisionId: request.syllabus_revision_id,
      title: request.title,
      titleSearchKey: searchKey(request.title),
      totalGrade: centsToGrade(totalCents),
      questionCount: inputs.length,
      origin: "AI_GENERATED",
      status: "DRAFT",
      generationRequestId: request.id,
    },
    select: { id: true },
  });
  await writeExamContent(tx, {
    examId,
    revisionId: request.syllabus_revision_id,
    topicItemIds: topics.map((topic) => topic.syllabusItemId),
    totalCents,
    questions: inputs,
    // Stable per execution and position: the proposal's item and the question stay linked.
    generationItemIds: context.itemIds.map((itemId) => derivedUuid(`${context.executionId}:${itemId}`)),
  });
  await tx.examGenerationRequest.update({ where: { id: request.id }, data: { generatedAt: context.now } });
  await context.get(AuditService).record(tx, {
    type: "exam_generation.completed",
    actorType: "SYSTEM",
    targetType: "EXAM_GENERATION_REQUEST",
    targetId: request.id,
    metadata: { examId, aiExecutionId: context.executionId },
  });
}
