import { centsToGrade, GeneratedWorkSchema, gradeToCents, type WorkDifficulty } from "@repo/contracts";
import { derivedUuid } from "../../../platform/crypto/derived-uuid";
import type { Tx } from "../../../platform/database/transaction";
import { searchKey } from "../../../platform/text/search-key";
import type { ProposalMaterializeContext } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { checkWorkQuestion } from "../../works/rules/work-rules";
import { writeWorkContent } from "../../works/work-content";
import { ProposalRejected } from "./proposal-rejected";
import { topicRef, WORK_GENERATION_REQUEST } from "./request-content";
import { generatedQuestionInput } from "./validate-generated-work";

interface LockedRequest {
  id: string;
  teacher_id: string;
  subject_id: string;
  syllabus_revision_id: string;
  title: string;
  description: string | null;
  difficulty: WorkDifficulty;
  total_grade: string;
  requested_quantity: number;
  language_id: string | null;
  ai_execution_id: string | null;
  generated_at: Date | null;
}

/**
 * `proposal.materialize` of `work-generator` (011 research W10, contracts/work-generator.md): in
 * the transaction that completes the execution, the request (locked) gets its DRAFT `AI_GENERATED`
 * work — subject, revision, title, description, difficulty and total grade from the request, its
 * topics in order, each question with the type's strategy and the value of its position — and
 * `generated_at`, audited `work_generation.generated`. Anything wrong throws, and the runner rolls
 * it all back: the work is whole or absent (FR-029).
 */
export async function materializeGeneratedWork(tx: Tx, context: ProposalMaterializeContext): Promise<void> {
  if (context.resource?.type !== WORK_GENERATION_REQUEST) throw new ProposalRejected("REQUEST_MISMATCH");
  const [request] = await tx.$queryRaw<LockedRequest[]>`
    SELECT id, teacher_id, subject_id, syllabus_revision_id, title, description, difficulty::text AS difficulty,
           total_grade::text AS total_grade, requested_quantity, language_id, ai_execution_id, generated_at
    FROM work_generation_requests
    WHERE id = ${context.resource.id}::uuid AND teacher_id = ${context.workspaceId}::uuid
    FOR UPDATE`;
  if (!request || request.ai_execution_id !== context.executionId || request.generated_at !== null) throw new ProposalRejected("REQUEST_MISMATCH");

  const { questions } = GeneratedWorkSchema.parse(context.content);
  if (questions.length !== request.requested_quantity) throw new ProposalRejected("COUNT_MISMATCH");
  const topics = await tx.workGenerationRequestTopic.findMany({
    where: { requestId: request.id },
    select: { syllabusItemId: true, position: true },
    orderBy: { position: "asc" },
  });
  const itemByRef = new Map(topics.map((topic) => [topicRef(topic.position), topic.syllabusItemId]));

  const inputs = questions.map((generated) => {
    const topicItemIds = generated.topicRefs.map((ref) => itemByRef.get(ref));
    if (topicItemIds.some((itemId) => itemId === undefined)) throw new ProposalRejected("TOPIC_OUT_OF_SCOPE");
    const { input } = checkWorkQuestion(generatedQuestionInput(generated, { languageId: request.language_id, topicItemIds: topicItemIds as string[] }));
    if (input === null) throw new ProposalRejected("STRUCTURE_INVALID");
    return input;
  });

  const totalCents = gradeToCents(request.total_grade);
  const { id: workId } = await tx.work.create({
    data: {
      teacherId: request.teacher_id,
      subjectId: request.subject_id,
      syllabusRevisionId: request.syllabus_revision_id,
      title: request.title,
      titleSearchKey: searchKey(request.title),
      description: request.description,
      difficulty: request.difficulty,
      totalGrade: centsToGrade(totalCents),
      questionCount: inputs.length,
      origin: "AI_GENERATED",
      status: "DRAFT",
      generationRequestId: request.id,
    },
    select: { id: true },
  });
  await writeWorkContent(tx, {
    workId,
    revisionId: request.syllabus_revision_id,
    topicItemIds: topics.map((topic) => topic.syllabusItemId),
    totalCents,
    questions: inputs,
    // Stable per execution and position: the proposal's item and the question stay linked.
    generationItemIds: context.itemIds.map((itemId) => derivedUuid(`${context.executionId}:${itemId}`)),
  });
  await tx.workGenerationRequest.update({ where: { id: request.id }, data: { generatedAt: context.now } });
  await context.get(AuditService).record(tx, {
    type: "work_generation.generated",
    actorType: "SYSTEM",
    targetType: "WORK_GENERATION_REQUEST",
    targetId: request.id,
    metadata: { executionId: context.executionId, workId, questionCount: inputs.length },
  });
}
