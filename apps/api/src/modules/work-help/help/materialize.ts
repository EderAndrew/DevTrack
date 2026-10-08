import { type WorkHelpBlockReason, WorkHelperOutputSchema, type WorkQuestionType } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import type { ProposalMaterializeContext, ProposalSettlement } from "../../ai/definitions/types";
import { AuditService } from "../../audit/audit.service";
import { checkLeak, type LeakCheckKey } from "./leak-check";
import { ProposalRejected } from "./proposal-rejected";
import { WORK_HELP_REQUEST } from "../definitions/request-content";

interface LockedRequest {
  id: string;
  attempt_id: string;
  question_id: string;
  status: string;
  ai_execution_id: string | null;
}

/**
 * `proposal.materialize` of `work-helper` (015 research F9–F11): in the transaction that completes
 * the execution, the request (its attempt, then itself, locked) must still be REQUESTED and belong to
 * this execution. An out-of-scope reply is stored and not counted (REJECT); an orientation goes
 * through the deterministic leak check, which reads the answer key from the snapshot here and only
 * here — BLOCKED keeps the reason code and no text (REJECT) —, else it is DELIVERED and counts as one
 * help (APPROVE). A request still pending when its attempt was submitted is delivered too (it was
 * asked in time). The deferred trigger refuses a 4th DELIVERED; anything wrong throws and the runner
 * rolls it all back.
 */
export async function materializeHelp(tx: Tx, context: ProposalMaterializeContext): Promise<ProposalSettlement> {
  if (context.resource?.type !== WORK_HELP_REQUEST) throw new ProposalRejected("REQUEST_MISMATCH");
  const owned = await tx.workHelpRequest.findFirst({
    where: { id: context.resource.id, studentUserId: context.workspaceId },
    select: { attemptId: true },
  });
  if (!owned) throw new ProposalRejected("REQUEST_MISMATCH");
  await tx.$queryRaw`SELECT id FROM activity_attempts WHERE id = ${owned.attemptId}::uuid FOR UPDATE`;
  const [request] = await tx.$queryRaw<LockedRequest[]>`
    SELECT id, attempt_id, question_id, status::text AS status, ai_execution_id
    FROM work_help_requests
    WHERE id = ${context.resource.id}::uuid
    FOR UPDATE`;
  if (!request || request.ai_execution_id !== context.executionId || request.status !== "REQUESTED") throw new ProposalRejected("REQUEST_MISMATCH");

  const output = WorkHelperOutputSchema.parse(context.content);
  const audit = context.get(AuditService);
  const base = { actorType: "SYSTEM" as const, targetType: "WORK_HELP_REQUEST" as const, targetId: request.id };
  const metadata = { attemptId: request.attempt_id, executionId: context.executionId };

  if (output.outcome === "OUT_OF_SCOPE") {
    await tx.workHelpRequest.update({ where: { id: request.id }, data: { status: "OUT_OF_SCOPE", message: output.message, resolvedAt: context.now } });
    await audit.record(tx, { ...base, type: "work_help.out_of_scope", metadata });
    return "REJECT";
  }

  const reason = checkLeak(await answerKeyOf(tx, request.question_id), { message: output.message, example: output.example?.code ?? null });
  if (reason) {
    await block(tx, request.id, reason, context.now);
    await audit.record(tx, { ...base, type: "work_help.blocked", metadata: { ...metadata, reasonCode: reason } });
    return "REJECT";
  }

  await tx.workHelpRequest.update({
    where: { id: request.id },
    data: { status: "DELIVERED", message: output.message, exampleCode: output.example?.code ?? null, resolvedAt: context.now },
  });
  const used = await tx.workHelpRequest.count({ where: { attemptId: request.attempt_id, status: "DELIVERED" } });
  await audit.record(tx, { ...base, type: "work_help.delivered", metadata: { ...metadata, used } });
  return "APPROVE";
}

function block(tx: Tx, requestId: string, reason: WorkHelpBlockReason, now: Date) {
  return tx.workHelpRequest.update({ where: { id: requestId }, data: { status: "BLOCKED", reasonCode: reason, resolvedAt: now } });
}

/** The snapshot question's answer key and what the student already sees of it (research F10). */
async function answerKeyOf(tx: Tx, questionId: string): Promise<LeakCheckKey> {
  const question = await tx.classActivityQuestion.findUniqueOrThrow({
    where: { id: questionId },
    select: {
      type: true,
      statement: true,
      expectedAnswer: true,
      explanation: true,
      starterCode: true,
      expectedSolution: true,
      alternatives: { orderBy: { position: "asc" }, select: { text: true } },
    },
  });
  const type: WorkQuestionType = question.type;
  switch (type) {
    case "MULTIPLE_CHOICE":
      return { type, alternatives: question.alternatives.map((alternative) => alternative.text) };
    case "OPEN_ANSWER":
      return { type, statement: question.statement, expectedAnswer: question.expectedAnswer, explanation: question.explanation };
    case "CODE":
      return { type, starterCode: question.starterCode, expectedSolution: question.expectedSolution };
  }
}
