import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, createAiProposal, createAiTestApp, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

/** 006/FR-045 006/SC-010: concurrent decisions and completions have exactly one winner. */
describe("006/FR-045 006/SC-010 concorrência de propostas", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const decide = (id: string, body: object) => api(t, { cookie }).post(`/api/ai/proposals/${id}/decision`, body);
  const decisionEvents = () => t.prisma.auditEvent.count({ where: { type: { in: ["ai_proposal.approved", "ai_proposal.partially_approved", "ai_proposal.rejected"] } } });

  it("duas decisões diferentes simultâneas → uma vence e a outra recebe 409", async () => {
    for (let round = 0; round < 5; round += 1) {
      const proposal = await createAiProposal(t, teacher.id, subjectId);
      const results = await Promise.all([decide(proposal.id, { decision: "APPROVE" }), decide(proposal.id, { decision: "REJECT" })]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
      const winner = results.find((res) => res.status === 200)!;
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe(winner.body.status);
    }
    expect(await decisionEvents()).toBe(5);
  });

  it("duas decisões iguais simultâneas → a mesma resposta e um evento só", async () => {
    const proposal = await createAiProposal(t, teacher.id, subjectId);
    const body = { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i1", "i2"] };
    const [a, b] = await Promise.all([decide(proposal.id, body), decide(proposal.id, body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    expect(await decisionEvents()).toBe(1);
  });

  it("conclusão concorrente de uma execução L2 → uma proposta só", async () => {
    t.provider.script(fakeOutput({ items: [{ id: "i1", label: "Item" }] }));
    const res = await requestExecution(t, cookie, { agentKey: "reference-l2", resource: { type: "SUBJECT", id: subjectId } });
    const worker = t.get(AiExecutionWorker);
    const claimed = await Promise.all([worker.runOnce(), worker.runOnce(), worker.runOnce()]);
    expect(claimed.reduce((x, y) => x + y, 0)).toBe(1);
    expect(await t.prisma.aiProposal.count({ where: { executionId: res.body.id } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.created" } })).toBe(1);
  });

  it("UNIQUE (execution_id): uma segunda proposta para a mesma execução é recusada pelo banco", async () => {
    const proposal = await createAiProposal(t, teacher.id, subjectId);
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: proposal.executionId } });
    await expect(
      t.prisma.aiProposal.create({
        data: {
          workspaceId: teacher.id,
          executionId: execution.id,
          agentVersionId: execution.agentVersionId,
          agentKey: "reference-l2",
          proposalType: "REFERENCE_ITEMS",
          targetResourceType: "SUBJECT",
          payload: { items: [] },
          itemIds: ["x"],
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // An unrelated execution can still get its own.
    await createAiExecution(t, teacher.id, "reference-l2", { status: "COMPLETED" });
  });
});
