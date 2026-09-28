import type { AiExecutionStatus, AiProposalStatus, CurriculumExtractionOutputV2 } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { CURRICULUM_AGENT_KEY } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { derivedUuid } from "../../src/modules/curriculum-ai/proposal/derived-uuid";
import { type AiTestApp, createAiExecution, drain, resetAiDb } from "../helpers/ai";
import {
  createCurriculumAiApp,
  createCurriculumProposal,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createConfirmedRevision, createUser, loginAs, type TestUser } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

const NOTHING_FOUND: CurriculumExtractionOutputV2 = { title: null, syllabusText: null, competencyText: null, groups: [], warnings: [], languageKey: null };

/** Everything a new request must leave as it was: executions, proposals and the syllabus. */
async function snapshot(t: AiTestApp) {
  return {
    executions: await t.prisma.aiExecution.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, idempotencyKey: true, finishedAt: true } }),
    proposals: await t.prisma.aiProposal.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, decidedAt: true, payload: true } }),
    revisions: await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("007/US7 o professor pede nova análise quando precisa", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let document: SyllabusDocument;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
    await createConfirmedRevision(t, document.id, [{ title: "Fundamentos", items: ["Classes"] }]);
  });

  const resource = () => ({ type: "SYLLABUS_DOCUMENT", id: document.id });

  describe("007/US7-1 007/FR-037 depois de um resultado final, cada pedido é uma nova execução", () => {
    it.each(["FAILED", "TIMED_OUT", "CANCELLED"] as AiExecutionStatus[])("execução %s → nova execução com a chave n + 1; a anterior igual", async (status) => {
      await createAiExecution(t, teacher.id, CURRICULUM_AGENT_KEY, { status, resource: resource() });
      const before = await snapshot(t);

      const res = await requestAnalysis(t, cookie, document.id);

      expect(res.status).toBe(202);
      expect(res.body.created).toBe(true);
      const created = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id } });
      expect(created.idempotencyKey).toBe(derivedUuid(`curriculum-ai:${document.id}:1`));
      const after = await snapshot(t);
      expect(after.executions.filter((row) => row.id !== created.id)).toEqual(before.executions);
      expect(after.proposals).toEqual(before.proposals);
      expect(after.revisions).toEqual(before.revisions);
    });

    it.each(["REJECTED", "EXPIRED", "APPROVED", "PARTIALLY_APPROVED"] as AiProposalStatus[])(
      "proposta %s → nova execução; a execução e a proposta anteriores iguais",
      async (status) => {
        await createCurriculumProposal(t, teacher.id, document, { status });
        const before = await snapshot(t);

        const res = await requestAnalysis(t, cookie, document.id);

        expect({ status: res.status, created: res.body.created }).toEqual({ status: 202, created: true });
        const after = await snapshot(t);
        expect(after.executions.filter((row) => row.id !== res.body.execution.id)).toEqual(before.executions);
        expect(after.proposals).toEqual(before.proposals);
        expect(after.revisions).toEqual(before.revisions);
      },
    );

    it("proposta READY_FOR_REVIEW já vencida conta como EXPIRED: não bloqueia o pedido", async () => {
      await createCurriculumProposal(t, teacher.id, document, { expiresAt: new Date(Date.now() - 1000) });
      const res = await requestAnalysis(t, cookie, document.id);
      expect(res.status).toBe(202);
    });

    it("três análises seguidas pelo runner real → três execuções e três chaves, a última com a nova proposta", async () => {
      for (let n = 0; n < 3; n++) {
        scriptCurriculumRun(t.provider, document.id, NOTHING_FOUND);
        const res = await requestAnalysis(t, cookie, document.id);
        expect({ n, status: res.status }).toEqual({ n, status: 202 });
        await drain(t);
      }
      const rows = await t.prisma.aiExecution.findMany({ orderBy: { createdAt: "asc" } });
      expect(rows.map((row) => row.idempotencyKey)).toEqual([0, 1, 2].map((n) => derivedUuid(`curriculum-ai:${document.id}:${n}`)));
      expect(rows.every((row) => row.status === "COMPLETED")).toBe(true);
    });
  });

  describe("007/US7-2 007/FR-038 proposta pendente", () => {
    it("sem discardPendingProposal → 409 CURRICULUM_PROPOSAL_PENDING e nada muda", async () => {
      await createCurriculumProposal(t, teacher.id, document);
      const before = await snapshot(t);

      for (const body of [{}, { discardPendingProposal: false }]) {
        const res = await requestAnalysis(t, cookie, document.id, body);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "CURRICULUM_PROPOSAL_PENDING" });
      }
      expect(await snapshot(t)).toEqual(before);
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["curriculum_ai.analysis_requested", "ai_proposal.rejected"] } } })).toBe(0);
    });

    it("com true → a pendente fica REJECTED pelo professor, depois vem a nova execução, e a auditoria registra discardedProposal", async () => {
      const pending = await createCurriculumProposal(t, teacher.id, document);

      const res = await requestAnalysis(t, cookie, document.id, { discardPendingProposal: true });

      expect({ status: res.status, created: res.body.created }).toEqual({ status: 202, created: true });
      const rejected = await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: pending.id } });
      expect(rejected).toMatchObject({ status: "REJECTED", decidedByUserId: teacher.id });
      const events = await t.prisma.auditEvent.findMany({
        where: { type: { in: ["ai_proposal.rejected", "ai_execution.requested", "curriculum_ai.analysis_requested"] } },
        orderBy: { id: "asc" },
      });
      expect(events.map((event) => event.type)).toEqual(["ai_proposal.rejected", "ai_execution.requested", "curriculum_ai.analysis_requested"]);
      expect(events[2]!.metadata).toEqual({ executionId: res.body.execution.id, created: true, discardedProposal: true });
      expect(events[0]).toMatchObject({ actorType: "USER", actorUserId: teacher.id });
    });

    it("sem proposta pendente, discardPendingProposal: true não rejeita nada e registra discardedProposal false", async () => {
      const res = await requestAnalysis(t, cookie, document.id, { discardPendingProposal: true });
      expect(res.status).toBe(202);
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.analysis_requested" } });
      expect(event.metadata).toMatchObject({ discardedProposal: false });
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.rejected" } })).toBe(0);
    });

    it("se o pedido falha depois da rejeição (agente desabilitado entre os passos), a ementa não muda e um novo pedido funciona", async () => {
      const pending = await createCurriculumProposal(t, teacher.id, document);
      await t.prisma.aiAgent.update({ where: { key: CURRICULUM_AGENT_KEY }, data: { status: "DISABLED" } });
      const revisions = await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" } });

      const failed = await requestAnalysis(t, cookie, document.id, { discardPendingProposal: true });

      expect({ status: failed.status, code: failed.body.code }).toEqual({ status: 409, code: "AI_AGENT_DISABLED" });
      expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("REJECTED");
      expect(await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" } })).toEqual(revisions);
      expect(await t.prisma.aiExecution.count({ where: { status: "QUEUED" } })).toBe(0);

      await t.prisma.aiAgent.update({ where: { key: CURRICULUM_AGENT_KEY }, data: { status: "ACTIVE" } });
      const again = await requestAnalysis(t, cookie, document.id);
      expect({ status: again.status, created: again.body.created }).toEqual({ status: 202, created: true });
    });
  });

  describe("007/US7-3 007/FR-015 limite por professor", () => {
    it("a 11ª análise na hora → 429 RATE_LIMITED sem execução, e a recusa auditada com o escopo curriculum-ai", async () => {
      for (let n = 1; n <= 10; n++) expect([200, 202]).toContain((await requestAnalysis(t, cookie, document.id)).status);

      const refused = await requestAnalysis(t, cookie, document.id);

      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 429, code: "RATE_LIMITED" });
      expect(await t.prisma.aiExecution.count()).toBe(1);
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.rate_limited" } });
      expect(event).toMatchObject({ actorUserId: teacher.id, metadata: { scope: "curriculum-ai" } });
      // Per teacher: another teacher still asks.
      const other = await createUser(t, { roles: ["TEACHER"] });
      const { document: own } = await seedProcessedDocument(t, other.id);
      expect((await requestAnalysis(t, await loginAs(t, other), own.id)).status).toBe(202);
    });

    it("o limite vem antes das outras checagens: documento sem texto também conta e recebe 429", async () => {
      const { document: image } = await seedProcessedDocument(t, teacher.id, "ementa.png");
      for (let n = 1; n <= 10; n++) expect((await requestAnalysis(t, cookie, image.id)).body.code).toBe("SYLLABUS_NOT_READY_FOR_AI");
      expect((await requestAnalysis(t, cookie, image.id)).status).toBe(429);
    });
  });
});

describe("007/US7-3 007/FR-015 o limite de execuções da 006 também se aplica", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createCurriculumAiApp({ config: { rateLimit: { ...base.rateLimit, curriculumAiPerHour: 100, aiExecutionsPerMinute: 2 } } });
    await resetAiDb(t);
  });
  afterAll(() => t.close());

  it("com o limite da 007 folgado, a 3ª execução no minuto → 429 com o escopo ai-execution", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const { document } = await seedProcessedDocument(t, teacher.id);
    for (let n = 0; n < 2; n++) {
      scriptCurriculumRun(t.provider, document.id, NOTHING_FOUND);
      expect((await requestAnalysis(t, cookie, document.id)).status).toBe(202);
      await drain(t);
    }

    const refused = await requestAnalysis(t, cookie, document.id);

    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 429, code: "RATE_LIMITED" });
    expect(await t.prisma.aiExecution.count()).toBe(2);
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.rate_limited" } });
    expect(event.metadata).toEqual({ scope: "ai-execution" });
  });
});
