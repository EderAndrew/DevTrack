import { createAiExecution, createAiProposal } from "../helpers/ai";
import { createSubject, loginAs, type TestUser } from "../helpers/factories";
import { api, type TestApp } from "../helpers/test-app";
import { AI_TEACHER, MATRIX, type MatrixEntry, routeKey } from "./authorization-matrix";

/**
 * The 006 matrix (contracts/permissions.md): every row of `MATRIX` guarded by an AI teacher
 * permission, called against a teacher's AI area built here. A new AI teacher route needs a
 * `VALID_BODY` entry, or the completeness test fails.
 */
export const AI_TEACHER_ROUTES = MATRIX.filter((entry) => (AI_TEACHER as readonly string[]).includes(entry.access));

/** What a teacher owns for the AI routes: a subject, a completed execution over it and a proposal. */
export interface AiArea {
  subjectId: string;
  executionId: string;
  proposalId: string;
}

export async function buildAiArea(t: TestApp, teacher: TestUser): Promise<AiArea> {
  const subject = await createSubject(t, teacher.id);
  const execution = await createAiExecution(t, teacher.id, "reference-l1", { status: "COMPLETED", resource: { type: "SUBJECT", id: subject.id } });
  const proposal = await createAiProposal(t, teacher.id, subject.id);
  return { subjectId: subject.id, executionId: execution.id, proposalId: proposal.id };
}

/** A body that passes validation for each route, so the permission and the context decide. */
export const VALID_BODY: Record<string, (area: AiArea) => object> = {
  "POST /ai/executions": (area) => ({
    agentKey: "reference-l1",
    resource: { type: "SUBJECT", id: area.subjectId },
    idempotencyKey: crypto.randomUUID(),
  }),
  "GET /ai/executions": () => ({}),
  "GET /ai/executions/:id": () => ({}),
  "GET /ai/executions/:id/result": () => ({}),
  "POST /ai/executions/:id/cancel": () => ({}),
  "GET /ai/proposals": () => ({}),
  "GET /ai/proposals/:id": () => ({}),
  "POST /ai/proposals/:id/decision": () => ({ decision: "REJECT" }),
};

/** Calls `entry` as `user` (anonymous with null) on the resources of `area`; `id` replaces `:id`. */
export async function callAiRoute(t: TestApp, entry: MatrixEntry, user: TestUser | null, area: AiArea, id?: string) {
  const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
  const own = entry.path.startsWith("/ai/proposals") ? area.proposalId : area.executionId;
  const url = `/api${entry.path.replace(":id", id ?? own)}`;
  const body = VALID_BODY[routeKey(entry)]!(area);
  return entry.method === "GET" ? client.get(url) : client.post(url, body);
}

/** Row counts that a refused call must leave untouched. */
export async function aiSnapshot(t: TestApp) {
  return {
    executions: await t.prisma.aiExecution.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, cancelRequestedAt: true } }),
    calls: await t.prisma.aiModelCall.count(),
    outputs: await t.prisma.aiExecutionOutput.count(),
    proposals: await t.prisma.aiProposal.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, decidedAt: true } }),
  };
}
