import type { CurriculumExtractionOutput } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiProposal, SyllabusDocument } from "../../src/generated/prisma/client";
import { AiProposalsService } from "../../src/modules/ai/proposals/ai-proposals.service";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  applyProposal,
  createCurriculumAiApp,
  createCurriculumProposal,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { createConfirmedRevision, createSyllabusDocument, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const ALL = ["title", "syllabusText", "competencyText", "group:0", "group:1", "group:2", "group:3"];

/** Every revision of the document with its groups and items, in a stable order. */
function syllabusSnapshot(t: AiTestApp, documentId: string) {
  return t.prisma.syllabusRevision.findMany({
    where: { documentId },
    orderBy: { id: "asc" },
    include: { groups: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } } },
  });
}

/** The draft's content in the shape of the proposal, to compare with what was accepted. */
function contentOf(revision: { title: string | null; syllabusText: string | null; competencyText: string | null; groups: { title: string | null; items: { text: string }[] }[] }) {
  return {
    title: revision.title,
    syllabusText: revision.syllabusText,
    competencyText: revision.competencyText,
    groups: revision.groups.map((group) => ({ title: group.title, items: group.items.map((item) => item.text) })),
  };
}

const expectedGroups = (output: CurriculumExtractionOutput, indexes: number[]) =>
  indexes.map((index) => ({ title: output.groups[index]!.title, items: output.groups[index]!.items.map((item) => item.text) }));

describe("007/US3 o professor revisa a proposta, aceita o que quiser e aplica num rascunho da 004", () => {
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

  const apply = (proposalId: string, acceptedItemIds: string[], replaceDraft = false, documentId = document.id) =>
    applyProposal(t, cookie, documentId, proposalId, { acceptedItemIds, replaceDraft });
  const proposalOf = (id: string) => t.prisma.aiProposal.findUniqueOrThrow({ where: { id } });
  const decide = (id: string, body: Record<string, unknown>) => api(t, { cookie }).post(`/api/ai/proposals/${id}/decision`, body);

  /** A proposal made by a real run on the fake provider. */
  async function analysedProposal(): Promise<AiProposal> {
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    const { body } = await requestAnalysis(t, cookie, document.id);
    await drain(t);
    return t.prisma.aiProposal.findFirstOrThrow({ where: { executionId: body.execution.id } });
  }

  it("007/US3-3 tudo aceito → rascunho DRAFT AI_ASSISTED com o conteúdo proposto; proposta APPROVED; auditoria na mesma transação", async () => {
    const proposal = await analysedProposal();
    expect(proposal.itemIds).toEqual(ALL);

    const res = await apply(proposal.id, ALL);
    expect(res.status).toBe(200);
    const { revision } = res.body;
    expect(revision).toMatchObject({ status: "DRAFT", source: "AI_ASSISTED", aiProposalId: proposal.id, number: 1, confirmedAt: null });
    const output = pooOutput();
    expect(contentOf(revision)).toEqual({
      title: output.title,
      syllabusText: output.syllabusText,
      competencyText: output.competencyText,
      groups: expectedGroups(output, [0, 1, 2, 3]),
    });
    expect(res.body.proposal).toMatchObject({ id: proposal.id, status: "APPROVED", decision: { nature: "HUMAN_DECISION", byUserId: teacher.id } });
    expect(await t.prisma.syllabusRevision.count({ where: { status: "CONFIRMED" } })).toBe(0);

    const applied = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.proposal_applied" } });
    const approved = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_proposal.approved", targetId: proposal.id } });
    expect(applied).toMatchObject({
      actorType: "USER",
      actorUserId: teacher.id,
      targetType: "SYLLABUS_DOCUMENT",
      targetId: document.id,
      metadata: {
        proposalId: proposal.id,
        revisionId: revision.id,
        revisionNumber: 1,
        replacedDraft: false,
        acceptedFields: 3,
        acceptedGroups: 4,
        groupCount: 4,
        itemCount: 16,
        unsupportedCount: 0,
      },
    });
    expect(applied.requestId).not.toBeNull();
    expect(applied.requestId).toBe(approved.requestId);
    expect(JSON.stringify(applied.metadata)).not.toContain(output.groups[0]!.items[0]!.text);
  });

  it("007/US3-4 competência e um grupo desmarcados → rascunho sem eles, na ordem; PARTIALLY_APPROVED", async () => {
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    const accepted = ["title", "syllabusText", "group:0", "group:2", "group:3"];
    const res = await apply(proposal.id, accepted);
    expect(res.status).toBe(200);

    const output = pooOutput();
    expect(contentOf(res.body.revision)).toEqual({
      title: output.title,
      syllabusText: output.syllabusText,
      competencyText: null,
      groups: expectedGroups(output, [0, 2, 3]),
    });
    expect(res.body.proposal).toMatchObject({ status: "PARTIALLY_APPROVED", acceptedItemIds: accepted });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.proposal_applied" } });
    expect(event.metadata).toMatchObject({ acceptedFields: 2, acceptedGroups: 3, groupCount: 3 });
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.partially_approved", targetId: proposal.id } })).toBe(1);
  });

  it("007/US3-5 o rascunho AI_ASSISTED é salvo e confirmado pelas rotas da 004, e a revisão confirmada mantém aiProposalId", async () => {
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    const { body } = await apply(proposal.id, ALL);
    const client = api(t, { cookie });
    const saved = await client.put(`/api/syllabus-revisions/${body.revision.id}`, {
      title: "POO (corrigido)",
      syllabusText: body.revision.syllabusText,
      competencyText: null,
      groups: [{ title: "Unidade 1", items: [{ text: "Classes e objetos" }] }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ source: "AI_ASSISTED", aiProposalId: proposal.id, title: "POO (corrigido)" });

    const confirmed = await client.post(`/api/syllabus-revisions/${body.revision.id}/confirm`, {});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ status: "CONFIRMED", source: "AI_ASSISTED", aiProposalId: proposal.id });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "syllabus.revision_confirmed" } });
    expect(event.metadata).toMatchObject({ source: "AI_ASSISTED" });
  });

  it("007/US3-6 007/FR-029 rejeitar pela rota da 006 → REJECTED, e as revisões ficam iguais", async () => {
    await createConfirmedRevision(t, document.id, [{ items: ["Classes"] }]);
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    const before = await syllabusSnapshot(t, document.id);

    const res = await decide(proposal.id, { decision: "REJECT" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
    expect(await syllabusSnapshot(t, document.id)).toEqual(before);
    expect(await t.prisma.auditEvent.count({ where: { type: "curriculum_ai.proposal_applied" } })).toBe(0);
  });

  describe("007/US3-7 007/FR-034 aplicar é idempotente e acontece uma vez só", () => {
    it("a mesma seleção de novo responde o mesmo corpo, sem outro rascunho nem grupos duplicados", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      const first = await apply(proposal.id, ALL);
      const again = await apply(proposal.id, [...ALL].reverse());
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id } })).toBe(1);
      expect(await t.prisma.syllabusGroup.count({ where: { revisionId: first.body.revision.id } })).toBe(4);
      expect(await t.prisma.auditEvent.count({ where: { type: "curriculum_ai.proposal_applied" } })).toBe(1);
    });

    it("dois pedidos simultâneos → um rascunho, e os dois recebem a mesma revisão", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      const [a, b] = await Promise.all([apply(proposal.id, ALL), apply(proposal.id, ALL)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.revision.id).toBe(b.body.revision.id);
      expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id } })).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_proposal.approved" } })).toBe(1);
    });

    it("outra seleção ou REJECT depois de aplicada → 409 INVALID_STATE_TRANSITION", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      expect((await apply(proposal.id, ALL)).status).toBe(200);

      const other = await apply(proposal.id, ["title"]);
      expect(other.status).toBe(409);
      expect(other.body.code).toBe("INVALID_STATE_TRANSITION");
      const reject = await decide(proposal.id, { decision: "REJECT" });
      expect(reject.status).toBe(409);
      expect(reject.body.code).toBe("INVALID_STATE_TRANSITION");
      expect((await proposalOf(proposal.id)).status).toBe("APPROVED");
    });

    it("proposta rejeitada → aplicar dá 409 INVALID_STATE_TRANSITION, sem rascunho", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      expect((await decide(proposal.id, { decision: "REJECT" })).status).toBe(200);
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
    });
  });

  describe("007/US3-8 007/FR-036 conteúdo que o rascunho da 004 não aceita", () => {
    const tooLong = (): CurriculumExtractionOutput => ({ ...pooOutput(), syllabusText: "x".repeat(10_001) });

    it("422 CURRICULUM_PROPOSAL_INVALID, nada gravado e a proposta segue READY_FOR_REVIEW", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { extraction: tooLong() });
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ statusCode: 422, code: "CURRICULUM_PROPOSAL_INVALID", message: expect.any(String) });
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
      expect((await proposalOf(proposal.id)).status).toBe("READY_FOR_REVIEW");
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["curriculum_ai.proposal_applied", "ai_proposal.approved"] } } })).toBe(0);
    });

    it("desmarcar o campo inválido e aplicar o resto funciona", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { extraction: tooLong() });
      expect((await apply(proposal.id, ALL)).status).toBe(422);
      const res = await apply(proposal.id, ALL.filter((id) => id !== "syllabusText"));
      expect(res.status).toBe(200);
      expect(res.body.revision.syllabusText).toBeNull();
      expect(res.body.proposal.status).toBe("PARTIALLY_APPROVED");
    });
  });

  describe("007/US3-9 007/FR-032 rascunho existente", () => {
    it("replaceDraft: false → 409 REVISION_DRAFT_EXISTS e nada muda; true → o mesmo rascunho com o conteúdo trocado", async () => {
      const draft = await api(t, { cookie }).post(`/api/syllabus-documents/${document.id}/revisions`, { source: "EXTRACTION" });
      expect(draft.status).toBe(201);
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      const before = await syllabusSnapshot(t, document.id);

      const refused = await apply(proposal.id, ["title", "group:1"]);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe("REVISION_DRAFT_EXISTS");
      expect(await syllabusSnapshot(t, document.id)).toEqual(before);
      expect((await proposalOf(proposal.id)).status).toBe("READY_FOR_REVIEW");

      const replaced = await apply(proposal.id, ["title", "group:1"], true);
      expect(replaced.status).toBe(200);
      expect(replaced.body.revision).toMatchObject({
        id: draft.body.id,
        number: draft.body.number,
        status: "DRAFT",
        source: "AI_ASSISTED",
        aiProposalId: proposal.id,
        syllabusText: null,
        competencyText: null,
      });
      expect(contentOf(replaced.body.revision).groups).toEqual(expectedGroups(pooOutput(), [1]));
      expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id } })).toBe(1);
      expect(await t.prisma.syllabusGroup.count({ where: { revisionId: draft.body.id } })).toBe(1);
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "curriculum_ai.proposal_applied" } });
      expect(event.metadata).toMatchObject({ replacedDraft: true, revisionId: draft.body.id });
    });

    it("um rascunho baseado numa revisão confirmada também é substituído, e a confirmada fica intacta", async () => {
      const confirmed = await createConfirmedRevision(t, document.id, [{ items: ["Classes"] }]);
      const draft = await api(t, { cookie }).post(`/api/syllabus-documents/${document.id}/revisions`, {
        source: "REVISION",
        basedOnRevisionId: confirmed.revision.id,
      });
      expect(draft.status).toBe(201);
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      const res = await apply(proposal.id, ALL, true);
      expect(res.status).toBe(200);
      expect(res.body.revision).toMatchObject({ id: draft.body.id, source: "AI_ASSISTED" });
      const row = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: draft.body.id } });
      expect(row.basedOnRevisionId).toBeNull();
      expect(await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: confirmed.revision.id } })).toMatchObject({ status: "CONFIRMED" });
    });
  });

  it("007/FR-033 com revisão confirmada, o rascunho é a revisão seguinte e a confirmada fica intacta", async () => {
    const confirmed = await createConfirmedRevision(t, document.id, [{ items: ["Classes", "Objetos"] }]);
    const before = await syllabusSnapshot(t, document.id);
    const proposal = await createCurriculumProposal(t, teacher.id, document);

    const res = await apply(proposal.id, ALL);
    expect(res.status).toBe(200);
    expect(res.body.revision).toMatchObject({ number: 2, status: "DRAFT" });
    const after = await syllabusSnapshot(t, document.id);
    expect(after.find((revision) => revision.id === confirmed.revision.id)).toEqual(before[0]);
  });

  describe("007/US3-10 proposta expirada", () => {
    it("expirada pela varredura da 006 → 409 INVALID_STATE_TRANSITION", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { expiresAt: new Date(Date.now() - 1_000) });
      expect(await t.get(AiProposalsService).expireDue(new Date())).toBe(1);
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
    });

    it("vencida antes da varredura → 409 também", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { expiresAt: new Date(Date.now() - 1_000) });
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
      expect(await t.prisma.syllabusRevision.count()).toBe(0);
    });
  });

  describe("007/FR-035 a proposta precisa corresponder ao documento", () => {
    it("sha256 diferente → 409 CURRICULUM_SOURCE_CHANGED", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { source: { sha256: "0".repeat(64) } });
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CURRICULUM_SOURCE_CHANGED");
      expect((await proposalOf(proposal.id)).status).toBe("READY_FOR_REVIEW");
    });

    it("readerVersion desconhecido → 409 CURRICULUM_SOURCE_CHANGED", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document, { source: { readerVersion: 2 } });
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CURRICULUM_SOURCE_CHANGED");
    });

    it("proposta de outro documento do mesmo professor → 404", async () => {
      const other = await createSyllabusDocument(t, document.subjectId, { fixture: "poo.docx", status: "PROCESSED" });
      const proposal = await createCurriculumProposal(t, teacher.id, other);
      const res = await apply(proposal.id, ALL);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
    });

    it("proposta de outro professor ou de outro tipo → 404", async () => {
      const intruder = await createUser(t, { roles: ["TEACHER"] });
      const foreign = await createCurriculumProposal(t, intruder.id, document);
      expect((await apply(foreign.id, ALL)).status).toBe(404);
      const unknown = await apply("00000000-0000-4000-8000-000000000000", ALL);
      expect(unknown.status).toBe(404);
    });
  });

  it("id aceito fora de itemIds → 400 VALIDATION_ERROR, nada gravado", async () => {
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    const outside = await apply(proposal.id, ["title", "group:9"]);
    expect(outside.status).toBe(400);
    expect(outside.body.code).toBe("VALIDATION_ERROR");
    const malformed = await apply(proposal.id, ["title", "unit:1"]);
    expect(malformed.status).toBe(400);
    const empty = await apply(proposal.id, []);
    expect(empty.status).toBe(400);
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
    expect((await proposalOf(proposal.id)).status).toBe("READY_FOR_REVIEW");
  });

  it("007/FR-030 APPROVE ou APPROVE_PARTIALLY pela rota da 006 → 409 AI_PROPOSAL_APPLY_REQUIRED", async () => {
    const proposal = await createCurriculumProposal(t, teacher.id, document);
    for (const body of [{ decision: "APPROVE" }, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["title"] }]) {
      const res = await decide(proposal.id, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("AI_PROPOSAL_APPLY_REQUIRED");
    }
    expect((await proposalOf(proposal.id)).status).toBe("READY_FOR_REVIEW");
  });

  it("POST /syllabus-documents/:id/revisions com source AI_ASSISTED → 400", async () => {
    const res = await api(t, { cookie }).post(`/api/syllabus-documents/${document.id}/revisions`, { source: "AI_ASSISTED" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  describe("no banco", () => {
    it("o CHECK recusa AI_ASSISTED sem proposta e uma proposta em revisão de outra origem", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      await expect(
        t.prisma.syllabusRevision.create({ data: { documentId: document.id, number: 1, status: "DRAFT", source: "AI_ASSISTED" } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.syllabusRevision.create({
          data: { documentId: document.id, number: 1, status: "DRAFT", source: "MANUAL", aiProposalId: proposal.id },
        }),
      ).rejects.toThrow();
    });

    it("o UNIQUE recusa a segunda revisão da mesma proposta", async () => {
      const proposal = await createCurriculumProposal(t, teacher.id, document);
      const { body } = await apply(proposal.id, ALL);
      const other = await createSyllabusDocument(t, document.subjectId, { fixture: "poo.docx", status: "PROCESSED" });
      await expect(
        t.prisma.syllabusRevision.create({
          data: { documentId: other.id, number: 1, status: "DRAFT", source: "AI_ASSISTED", aiProposalId: body.proposal.id },
        }),
      ).rejects.toThrow();
    });
  });
});
