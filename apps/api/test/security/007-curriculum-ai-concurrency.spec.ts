import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { AiExecutionsService } from "../../src/modules/ai/execution/ai-executions.service";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { applyProposal, createCurriculumAiApp, createCurriculumProposal, requestAnalysis, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createConfirmedRevision, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const PARALLEL = 5;
const ALL = ["title", "syllabusText", "competencyText", "group:0", "group:1", "group:2", "group:3"];
const PARTIAL = ["title", "group:0"];

/**
 * 007/SC-004: concurrent applications, decisions and requests leave one result, guaranteed by the
 * database (the document and draft row locks, the proposal's lock and `UNIQUE (ai_proposal_id)`,
 * the derived idempotency key of the request).
 */
describe("007/SC-004 concorrência do Curriculum Agent", () => {
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
  });

  /** No group position or item position appears twice in any revision of the document. */
  async function duplicates(): Promise<number> {
    const [row] = await t.prisma.$queryRaw<{ count: number }[]>`
      SELECT (
        (SELECT count(*) FROM (SELECT revision_id, position FROM syllabus_groups g
           JOIN syllabus_revisions r ON r.id = g.revision_id WHERE r.document_id = ${document.id}::uuid
           GROUP BY revision_id, position HAVING count(*) > 1) x)
        +
        (SELECT count(*) FROM (SELECT group_id, i.position FROM syllabus_items i
           JOIN syllabus_groups g ON g.id = i.group_id JOIN syllabus_revisions r ON r.id = g.revision_id
           WHERE r.document_id = ${document.id}::uuid GROUP BY group_id, i.position HAVING count(*) > 1) y)
      )::int AS count`;
    return row!.count;
  }

  it(`${PARALLEL} aplicações simultâneas da mesma proposta → um rascunho, uma decisão, sem grupo ou item duplicado`, async () => {
    const proposal = await createCurriculumProposal(t, teacher.id, document);

    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: PARTIAL, replaceDraft: false })),
    );

    expect(results.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    expect(new Set(results.map((res) => res.body.revision.id)).size).toBe(1);
    const revisions = await t.prisma.syllabusRevision.findMany({ where: { documentId: document.id } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ status: "DRAFT", source: "AI_ASSISTED", aiProposalId: proposal.id });
    expect(await t.prisma.syllabusGroup.count({ where: { revisionId: revisions[0]!.id } })).toBe(1);
    expect(await t.prisma.syllabusItem.count({ where: { revisionId: revisions[0]!.id } })).toBe(4);
    expect(await duplicates()).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.partially_approved" } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "curriculum_ai.proposal_applied" } })).toBe(1);
  });

  it(`${PARALLEL} aplicações simultâneas de propostas diferentes do mesmo documento, com substituição → um rascunho só`, async () => {
    const proposals = [];
    for (let n = 0; n < PARALLEL; n++) proposals.push(await createCurriculumProposal(t, teacher.id, document));

    const results = await Promise.all(
      proposals.map((proposal) => applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ALL, replaceDraft: true })),
    );

    expect(results.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    const drafts = await t.prisma.syllabusRevision.findMany({ where: { documentId: document.id } });
    expect(drafts).toHaveLength(1);
    expect(await t.prisma.syllabusGroup.count({ where: { revisionId: drafts[0]!.id } })).toBe(4);
    expect(await duplicates()).toBe(0);
    // The draft is the last application's, and it names that proposal.
    expect(proposals.map((proposal) => proposal.id)).toContain(drafts[0]!.aiProposalId);
  });

  it("aplicação e rejeição concorrentes → um vencedor, e o estado combina com ele", async () => {
    for (let round = 0; round < 3; round++) {
      await resetAiDb(t);
      teacher = await createUser(t, { roles: ["TEACHER"] });
      cookie = await loginAs(t, teacher);
      ({ document } = await seedProcessedDocument(t, teacher.id));
      const proposal = await createCurriculumProposal(t, teacher.id, document);

      const [applied, rejected] = await Promise.all([
        applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ALL, replaceDraft: false }),
        api(t, { cookie }).post(`/api/ai/proposals/${proposal.id}/decision`, { decision: "REJECT" }),
      ]);

      const statuses = [applied.status, rejected.status].sort();
      expect(statuses).toEqual([200, 409]);
      const row = await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: proposal.id } });
      const drafts = await t.prisma.syllabusRevision.count({ where: { documentId: document.id } });
      if (applied.status === 200) {
        expect({ status: row.status, drafts }).toEqual({ status: "APPROVED", drafts: 1 });
        expect(rejected.body.code).toBe("INVALID_STATE_TRANSITION");
      } else {
        expect({ status: row.status, drafts }).toEqual({ status: "REJECTED", drafts: 0 });
        expect(applied.body.code).toBe("INVALID_STATE_TRANSITION");
      }
    }
  });

  it(`${PARALLEL} pedidos de análise simultâneos → uma execução, e os demais recebem a mesma`, async () => {
    const results = await Promise.all(Array.from({ length: PARALLEL }, () => requestAnalysis(t, cookie, document.id)));

    expect(results.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 202]);
    expect(new Set(results.map((res) => res.body.execution.id)).size).toBe(1);
    expect(await t.prisma.aiExecution.count()).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.requested" } })).toBe(1);
  });

  it("um pedido que cria a execução entre a checagem de ativa e a criação do outro → ainda uma execução", async () => {
    // The interleaving that failed in CI, forced: the first request stops right after seeing no
    // active execution, a second one runs to the end, then the first resumes.
    const executions = t.app.get(AiExecutionsService);
    const original = executions.findLatestForResource.bind(executions);
    let reachedCheck!: () => void;
    const paused = new Promise<void>((resolve) => (reachedCheck = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    executions.findLatestForResource = async (...args) => {
      const latest = await original(...args);
      if (++calls === 1) {
        reachedCheck();
        await released;
      }
      return latest;
    };
    try {
      const first = requestAnalysis(t, cookie, document.id).then((res) => res);
      await paused;
      const second = await requestAnalysis(t, cookie, document.id);
      release();

      expect([(await first).status, second.status].sort()).toEqual([200, 202]);
      expect((await first).body.execution.id).toBe(second.body.execution.id);
      expect(await t.prisma.aiExecution.count()).toBe(1);
    } finally {
      release();
      executions.findLatestForResource = original;
    }
  });

  describe("aplicação durante a confirmação de um rascunho da 004 → estado da 004 consistente", () => {
    it("a confirmação segura o rascunho: a aplicação espera, vê o rascunho confirmado e cria o próximo", async () => {
      const confirmed = await createConfirmedRevision(t, document.id, [{ title: "Fundamentos", items: ["Classes"] }]);
      const draft = await t.prisma.syllabusRevision.create({
        data: { documentId: document.id, number: confirmed.revision.number + 1, status: "DRAFT", source: "MANUAL" },
      });
      const group = await t.prisma.syllabusGroup.create({ data: { revisionId: draft.id, position: 1, title: "Manual" } });
      await t.prisma.syllabusItem.create({ data: { revisionId: draft.id, groupId: group.id, position: 1, text: "Item manual" } });
      const proposal = await createCurriculumProposal(t, teacher.id, document);

      // A confirmation in progress: the draft row locked, then confirmed, while the apply arrives.
      let applying!: ReturnType<typeof applyProposal>;
      await t.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM syllabus_revisions WHERE id = ${draft.id}::uuid FOR UPDATE`;
        applying = applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ALL, replaceDraft: true });
        void applying.then(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 300));
        await tx.syllabusRevision.update({ where: { id: draft.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: teacher.id } });
      });
      const res = await applying;

      expect(res.status).toBe(200);
      expect(res.body.revision).toMatchObject({ number: draft.number + 1, status: "DRAFT", source: "AI_ASSISTED" });
      const manual = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
      expect(manual.status).toBe("CONFIRMED");
      expect(manual.items.map((item) => item.text)).toEqual(["Item manual"]);
      expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id, status: "DRAFT" } })).toBe(1);
      expect(await duplicates()).toBe(0);
    });

    it("confirmação e aplicação disparadas juntas → uma das duas ordens, sem erro e com um rascunho no máximo", async () => {
      const confirmed = await createConfirmedRevision(t, document.id, [{ title: "Fundamentos", items: ["Classes"] }]);
      const draft = await t.prisma.syllabusRevision.create({
        data: { documentId: document.id, number: confirmed.revision.number + 1, status: "DRAFT", source: "MANUAL" },
      });
      const group = await t.prisma.syllabusGroup.create({ data: { revisionId: draft.id, position: 1, title: "Manual" } });
      await t.prisma.syllabusItem.create({ data: { revisionId: draft.id, groupId: group.id, position: 1, text: "Item manual" } });
      const proposal = await createCurriculumProposal(t, teacher.id, document);

      const [confirm, applied] = await Promise.all([
        api(t, { cookie }).post(`/api/syllabus-revisions/${draft.id}/confirm`, {}),
        applyProposal(t, cookie, document.id, proposal.id, { acceptedItemIds: ALL, replaceDraft: true }),
      ]);

      expect([confirm.status, applied.status]).toEqual([200, 200]);
      const confirmedDraft = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: draft.id } });
      expect(confirmedDraft.status).toBe("CONFIRMED");
      const drafts = await t.prisma.syllabusRevision.findMany({ where: { documentId: document.id, status: "DRAFT" } });
      if (applied.body.revision.id === draft.id) {
        // The application came first: its content was confirmed.
        expect(confirmedDraft.source).toBe("AI_ASSISTED");
        expect(drafts).toHaveLength(0);
      } else {
        expect(confirmedDraft.source).toBe("MANUAL");
        expect(drafts.map((row) => row.id)).toEqual([applied.body.revision.id]);
      }
      expect(await duplicates()).toBe(0);
    });
  });
});
