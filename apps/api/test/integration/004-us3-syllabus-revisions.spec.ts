import { createHash } from "node:crypto";
import { SyllabusRevisionViewSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { FileStorage } from "../../src/platform/storage/file-storage";
import {
  createConfirmedRevision,
  createSubject,
  createSyllabusDocument,
  createUser,
  loginAs,
  pooExtraction,
  type SyllabusDocumentOptions,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

interface RevisionBody {
  id: string;
  number: number;
  status: string;
  source: string;
  title: string | null;
  syllabusText: string | null;
  competencyText: string | null;
  groups: { id: string; position: number; title: string | null; items: { id: string; position: number; text: string }[] }[];
  itemCount: number;
  confirmedAt: string | null;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** The groups of a revision as `{title, items: text[]}`, for comparisons. */
const shapeOf = (revision: RevisionBody) =>
  revision.groups.map((group) => ({ title: group.title, items: group.items.map((item) => item.text) }));

describe("004/US3 — revisão e confirmação do conteúdo extraído (FR-017, FR-021 – FR-024)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  async function setup(options: SyllabusDocumentOptions = { status: "PROCESSED" }) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const document = await createSyllabusDocument(t, subject.id, options);
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const createRevision = (body: object, documentId = document.id) =>
      client.post(`/api/syllabus-documents/${documentId}/revisions`, body);
    return { teacher, subject, document, client, createRevision };
  }

  const originalHash = async (documentId: string) => {
    const row = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: documentId } });
    return sha256(await t.get(FileStorage).get(row.fileId));
  };

  it("004/US3-1 revisão EXTRACTION pré-preenchida com título, ementa, competência, 4 grupos e 16 itens", async () => {
    const { document, client, createRevision } = await setup();
    const res = await createRevision({ source: "EXTRACTION" });

    expect(res.status).toBe(201);
    const revision = res.body as RevisionBody;
    expect(Object.keys(revision).sort()).toEqual(Object.keys(SyllabusRevisionViewSchema.shape).sort());
    const expected = pooExtraction() as unknown as {
      title: string;
      syllabusText: string;
      competencyText: string;
      groups: { title: string; items: string[] }[];
    };
    expect(revision).toMatchObject({
      documentId: document.id,
      number: 1,
      status: "DRAFT",
      source: "EXTRACTION",
      title: expected.title,
      syllabusText: expected.syllabusText,
      competencyText: expected.competencyText,
      itemCount: 16,
      confirmedAt: null,
    });
    expect(shapeOf(revision)).toEqual(expected.groups);
    expect(revision.groups.map((group) => group.title)).toEqual([
      "Fundamentos de POO",
      "Padrões de Design em POO",
      "POO em Ambientes Reais",
      "Práticas de Implementação",
    ]);
    expect(revision.groups.map((group) => group.position)).toEqual([1, 2, 3, 4]);
    expect(revision.groups[0]!.items.map((item) => item.position)).toEqual([1, 2, 3, 4]);

    const detail = await client.get(`/api/syllabus-documents/${document.id}`);
    expect(detail.body.draftRevisionId).toBe(revision.id);
    expect(detail.body.revisions).toEqual([
      { id: revision.id, number: 1, status: "DRAFT", source: "EXTRACTION", aiProposalId: null, confirmedAt: null },
    ]);
    expect((await client.get(`/api/syllabus-revisions/${revision.id}`)).body).toEqual(revision);
  });

  it("004/US3-2 PUT edita, move entre grupos, reordena, acrescenta e remove; o extraído e o original não mudam", async () => {
    const { document, client, createRevision } = await setup();
    const hashBefore = await originalHash(document.id);
    const draft = (await createRevision({ source: "EXTRACTION" })).body as RevisionBody;
    const [fundamentos, padroes] = draft.groups;

    const body = {
      title: "  Programação Orientada a Objetos  ",
      syllabusText: "Ementa revisada.",
      competencyText: null,
      groups: [
        {
          title: "Fundamentos",
          items: [
            // reordered, one edited, one removed ("Associações…"), one moved in from the second group
            { id: fundamentos!.items[1]!.id, text: fundamentos!.items[1]!.text },
            { id: fundamentos!.items[0]!.id, text: "Classes, objetos e métodos" },
            { id: padroes!.items[0]!.id, text: padroes!.items[0]!.text },
            { text: "Item acrescentado" },
          ],
        },
        { title: null, items: padroes!.items.slice(1).map((item) => ({ id: item.id, text: item.text })) },
      ],
    };
    const res = await client.put(`/api/syllabus-revisions/${draft.id}`, body);

    expect(res.status).toBe(200);
    const saved = res.body as RevisionBody;
    expect(saved).toMatchObject({ id: draft.id, status: "DRAFT", title: "Programação Orientada a Objetos", competencyText: null });
    expect(shapeOf(saved)).toEqual([
      {
        title: "Fundamentos",
        items: [
          "Encapsulamento, herança e polimorfismo",
          "Classes, objetos e métodos",
          "Princípios de design orientado a objetos (SOLID)",
          "Item acrescentado",
        ],
      },
      {
        title: null,
        items: ["Aplicação de padrões de projeto em POO", "Design para reutilização e extensibilidade", "Refatoração de código orientado a objetos"],
      },
    ]);
    expect(saved.itemCount).toBe(7);
    expect((await client.get(`/api/syllabus-revisions/${draft.id}`)).body).toEqual(saved);

    // FR-017: the extraction stays as produced; FR-010: the original keeps its checksum.
    const row = await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(row.extraction).toEqual(pooExtraction());
    expect(await originalHash(document.id)).toBe(hashBefore);
  });

  it("004/US3-3 confirmar → CONFIRMED com syllabus.revision_confirmed; depois PUT → 409; confirmar de novo → 200 sem novo registro", async () => {
    const { teacher, document, client, createRevision } = await setup();
    const draft = (await createRevision({ source: "EXTRACTION" })).body as RevisionBody;

    const res = await client.post(`/api/syllabus-revisions/${draft.id}/confirm`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: draft.id, status: "CONFIRMED", itemCount: 16 });
    expect(res.body.confirmedAt).toEqual(expect.any(String));
    const row = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.confirmedById).toBe(teacher.id);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "syllabus.revision_confirmed" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: "USER",
      actorUserId: teacher.id,
      targetType: "SYLLABUS_REVISION",
      targetId: draft.id,
      metadata: { documentId: document.id, number: 1, source: "EXTRACTION", groupCount: 4, itemCount: 16 },
    });

    const detail = await client.get(`/api/syllabus-documents/${document.id}`);
    expect(detail.body.confirmedRevision).toEqual({ id: draft.id, number: 1 });
    expect(detail.body.draftRevisionId).toBeNull();

    const put = await client.put(`/api/syllabus-revisions/${draft.id}`, { groups: [{ items: [{ text: "x" }] }] });
    expect(put.status).toBe(409);
    expect(put.body.code).toBe("REVISION_CONFIRMED");

    const again = await client.post(`/api/syllabus-revisions/${draft.id}/confirm`, {});
    expect(again.status).toBe(200);
    expect(again.body).toEqual(res.body);
    expect(await t.prisma.auditEvent.count({ where: { type: "syllabus.revision_confirmed" } })).toBe(1);
  });

  it("004/US3-3 confirmar sem itens → 422 REVISION_EMPTY e o rascunho continua", async () => {
    const { createRevision, client } = await setup();
    const draft = (await createRevision({ source: "MANUAL" })).body as RevisionBody;
    expect(draft).toMatchObject({ source: "MANUAL", title: null, groups: [], itemCount: 0 });

    const res = await client.post(`/api/syllabus-revisions/${draft.id}/confirm`, {});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("REVISION_EMPTY");
    expect((await client.put(`/api/syllabus-revisions/${draft.id}`, { groups: [{ title: "Vazio", items: [] }] })).status).toBe(200);
    expect((await client.post(`/api/syllabus-revisions/${draft.id}/confirm`, {})).body.code).toBe("REVISION_EMPTY");
    expect((await client.get(`/api/syllabus-revisions/${draft.id}`)).body.status).toBe("DRAFT");
  });

  it.each([
    ["FAILED", { status: "FAILED", failureCategory: "TIMEOUT" }],
    ["PROCESSED/NO_TEXT", { status: "PROCESSED", fixture: "ementa.png", extraction: null }],
    ["UPLOADED", { status: "UPLOADED" }],
  ] as const)("004/US3-4 documento %s: source EXTRACTION → 422 EXTRACTION_UNAVAILABLE", async (_label, options) => {
    const { document, client, createRevision } = await setup(options);
    const res = await createRevision({ source: "EXTRACTION" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("EXTRACTION_UNAVAILABLE");
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
    if (options.status === "FAILED") {
      expect((await client.get(`/api/syllabus-documents/${document.id}`)).body.failureCategory).toBe("TIMEOUT");
    }
  });

  it.each([
    ["FAILED", { status: "FAILED" }],
    ["PROCESSED/NO_TEXT", { status: "PROCESSED", fixture: "ementa.png", extraction: null }],
  ] as const)("004/US3-5 preencher manualmente em %s → confirmado ligado ao mesmo documento, source MANUAL", async (_label, options) => {
    const { document, client, createRevision } = await setup(options);
    const hashBefore = await originalHash(document.id);
    const draft = await createRevision({ source: "MANUAL" });
    expect(draft.status).toBe(201);

    const content = {
      title: "POO",
      syllabusText: null,
      competencyText: null,
      groups: [{ title: "Fundamentos", items: [{ text: "Classes e objetos" }, { text: "Herança" }] }],
    };
    expect((await client.put(`/api/syllabus-revisions/${draft.body.id}`, content)).status).toBe(200);
    const confirmed = await client.post(`/api/syllabus-revisions/${draft.body.id}/confirm`, {});

    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ documentId: document.id, status: "CONFIRMED", source: "MANUAL", itemCount: 2 });
    expect((await client.get(`/api/syllabus-documents/${document.id}`)).body.confirmedRevision).toEqual({
      id: draft.body.id,
      number: 1,
    });
    expect(await originalHash(document.id)).toBe(hashBefore);
  });

  it("004/US3-6 source REVISION copia a confirmada com originItemId; a confirmada anterior não muda", async () => {
    const { document, client, createRevision } = await setup();
    const base = await createConfirmedRevision(t, document.id, [
      { title: "Fundamentos", items: ["Classes", "Objetos"] },
      { title: "Padrões", items: ["SOLID"] },
    ]);
    const baseBefore = (await client.get(`/api/syllabus-revisions/${base.revision.id}`)).body as RevisionBody;

    const res = await createRevision({ source: "REVISION", basedOnRevisionId: base.revision.id });
    expect(res.status).toBe(201);
    const copy = res.body as RevisionBody;
    expect(copy).toMatchObject({ number: 2, status: "DRAFT", source: "REVISION", itemCount: 3 });
    expect(shapeOf(copy)).toEqual(shapeOf(baseBefore));
    const copied = await t.prisma.syllabusItem.findMany({ where: { revisionId: copy.id }, orderBy: [{ group: { position: "asc" } }, { position: "asc" }] });
    expect(copied.map((item) => item.originItemId)).toEqual(base.itemIds);
    const row = await t.prisma.syllabusRevision.findUniqueOrThrow({ where: { id: copy.id } });
    expect(row.basedOnRevisionId).toBe(base.revision.id);

    // Saving with the items' ids keeps their origin; a new item has none.
    const [fundamentos, padroes] = copy.groups;
    const saved = await client.put(`/api/syllabus-revisions/${copy.id}`, {
      groups: [
        { title: "Fundamentos", items: [{ id: fundamentos!.items[1]!.id, text: "Objetos (corrigido)" }, { text: "Novo" }] },
        { title: "Padrões", items: [{ id: padroes!.items[0]!.id, text: "SOLID" }] },
      ],
    });
    expect(saved.status).toBe(200);
    const after = await t.prisma.syllabusItem.findMany({ where: { revisionId: copy.id }, orderBy: [{ group: { position: "asc" } }, { position: "asc" }] });
    expect(after.map((item) => [item.text, item.originItemId])).toEqual([
      ["Objetos (corrigido)", base.itemIds[1]],
      ["Novo", null],
      ["SOLID", base.itemIds[2]],
    ]);

    expect((await client.post(`/api/syllabus-revisions/${copy.id}/confirm`, {})).status).toBe(200);
    expect((await client.get(`/api/syllabus-revisions/${base.revision.id}`)).body).toEqual(baseBefore);
    expect((await client.get(`/api/syllabus-documents/${document.id}`)).body.confirmedRevision).toEqual({ id: copy.id, number: 2 });
  });

  it("004/US3-6 base em rascunho → 422 REVISION_NOT_CONFIRMED; base de outro documento → 404", async () => {
    const { subject, document, createRevision } = await setup();
    // The base is checked before the "one draft" rule, so a draft as base gets its own answer.
    const draft = (await createRevision({ source: "MANUAL" })).body as RevisionBody;
    const onDraft = await createRevision({ source: "REVISION", basedOnRevisionId: draft.id });
    expect(onDraft.status).toBe(422);
    expect(onDraft.body.code).toBe("REVISION_NOT_CONFIRMED");

    const other = await createSyllabusDocument(t, subject.id, { status: "PROCESSED", bytes: Buffer.from("%PDF-outra") });
    const otherBase = await createConfirmedRevision(t, other.id, [{ items: ["Item"] }]);
    const cross = await createRevision({ source: "REVISION", basedOnRevisionId: otherBase.revision.id });
    expect(cross.status).toBe(404);
    expect((await createRevision({ source: "REVISION", basedOnRevisionId: crypto.randomUUID() })).status).toBe(404);
    expect(await t.prisma.syllabusRevision.count({ where: { documentId: document.id } })).toBe(1);
  });

  it("segundo rascunho → 409 REVISION_DRAFT_EXISTS; número segue max + 1", async () => {
    const { document, createRevision } = await setup();
    await createConfirmedRevision(t, document.id, [{ items: ["A"] }]);
    const first = await createRevision({ source: "EXTRACTION" });
    expect(first.body.number).toBe(2);
    const second = await createRevision({ source: "MANUAL" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("REVISION_DRAFT_EXISTS");
    expect(await t.prisma.syllabusRevision.count({ where: { status: "DRAFT" } })).toBe(1);
  });

  it("validação: basedOnRevisionId só com REVISION, campo desconhecido, mais de 500 itens e ids repetidos → 400", async () => {
    const { createRevision, client } = await setup();
    expect((await createRevision({ source: "REVISION" })).status).toBe(400);
    expect((await createRevision({ source: "MANUAL", basedOnRevisionId: crypto.randomUUID() })).status).toBe(400);
    expect((await createRevision({ source: "OCR" })).status).toBe(400);
    const draft = (await createRevision({ source: "MANUAL" })).body as RevisionBody;

    const put = (body: object) => client.put(`/api/syllabus-revisions/${draft.id}`, body);
    const items = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Item ${i + 1}` }));
    expect((await put({ groups: [{ items: items(300) }, { items: items(201) }] })).status).toBe(400);
    expect((await put({ groups: [{ items: items(300) }, { items: items(200) }] })).status).toBe(200);
    expect((await put({ groups: [{ items: [{ text: "   " }] }] })).status).toBe(400);
    expect((await put({ groups: [], extra: 1 })).status).toBe(400);
    const id = crypto.randomUUID();
    expect((await put({ groups: [{ items: [{ id, text: "a" }, { id, text: "b" }] }] })).status).toBe(400);
    // An id that is not an item of this draft is just a new item.
    const unknown = await put({ groups: [{ items: [{ id, text: "a" }] }] });
    expect(unknown.status).toBe(200);
    expect(unknown.body.groups[0].items[0].id).not.toBe(id);
  });

  it("004/SC-004 UPDATE ou DELETE direto em revisão, grupo ou item confirmado → erro da trigger", async () => {
    const { document } = await setup();
    const confirmed = await createConfirmedRevision(t, document.id, [{ title: "G", items: ["A", "B"] }]);
    const revisionId = confirmed.revision.id;
    const groupId = confirmed.groups[0]!.id;
    const itemId = confirmed.itemIds[0]!;

    await expect(t.prisma.$executeRaw`UPDATE syllabus_revisions SET title = 'x' WHERE id = ${revisionId}::uuid`).rejects.toThrow(/immutable/);
    await expect(t.prisma.$executeRaw`UPDATE syllabus_groups SET title = 'x' WHERE id = ${groupId}::uuid`).rejects.toThrow(/immutable/);
    await expect(t.prisma.$executeRaw`UPDATE syllabus_items SET text = 'x' WHERE id = ${itemId}::uuid`).rejects.toThrow(/immutable/);
    await expect(t.prisma.$executeRaw`DELETE FROM syllabus_items WHERE id = ${itemId}::uuid`).rejects.toThrow(/immutable/);
    await expect(
      t.prisma.$executeRaw`INSERT INTO syllabus_items (revision_id, group_id, position, text) VALUES (${revisionId}::uuid, ${groupId}::uuid, 9, 'x')`,
    ).rejects.toThrow(/immutable/);
    const items = await t.prisma.syllabusItem.findMany({ where: { revisionId }, orderBy: { position: "asc" } });
    expect(items.map((item) => item.text)).toEqual(["A", "B"]);
  });

  it("processamento terminou depois do preenchimento manual: o rascunho fica intacto e a extração vira sugestão", async () => {
    const { document, client, createRevision } = await setup({ status: "UPLOADED" });
    const draft = (await createRevision({ source: "MANUAL" })).body as RevisionBody;
    const content = { title: "Manual", groups: [{ title: "Meu grupo", items: [{ text: "Meu item" }] }] };
    const saved = (await client.put(`/api/syllabus-revisions/${draft.id}`, content)).body as RevisionBody;

    expect(await t.get(SyllabusProcessingWorker).runOnce()).toBe(1);

    const detail = await client.get(`/api/syllabus-documents/${document.id}`);
    expect(detail.body).toMatchObject({ processingStatus: "PROCESSED", extractionResult: "TEXT", draftRevisionId: draft.id });
    expect(detail.body.extraction.groups).toHaveLength(4);
    expect((await client.get(`/api/syllabus-revisions/${draft.id}`)).body).toEqual(saved);
    // The draft stays the only one: the extraction is not turned into a second draft.
    expect((await createRevision({ source: "EXTRACTION" })).body.code).toBe("REVISION_DRAFT_EXISTS");
  });

  it("004/FR-018 texto com <script> é guardado e devolvido como texto", async () => {
    const { client, createRevision } = await setup();
    const draft = (await createRevision({ source: "MANUAL" })).body as RevisionBody;
    const hostile = `<script>alert("x")</script> & <img src=x onerror=alert(1)>`;
    const res = await client.put(`/api/syllabus-revisions/${draft.id}`, {
      title: hostile,
      syllabusText: hostile,
      groups: [{ title: hostile, items: [{ text: hostile }] }],
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.body.title).toBe(hostile);
    expect(res.body.groups[0].items[0].text).toBe(hostile);
  });

  it("contexto: documento ou revisão de outro professor → 404 em todas as rotas", async () => {
    const { document, createRevision } = await setup();
    const draft = (await createRevision({ source: "EXTRACTION" })).body as RevisionBody;
    const intruder = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });

    expect((await intruder.post(`/api/syllabus-documents/${document.id}/revisions`, { source: "MANUAL" })).status).toBe(404);
    expect((await intruder.get(`/api/syllabus-revisions/${draft.id}`)).status).toBe(404);
    expect((await intruder.put(`/api/syllabus-revisions/${draft.id}`, { groups: [] })).status).toBe(404);
    expect((await intruder.post(`/api/syllabus-revisions/${draft.id}/confirm`, {})).status).toBe(404);
    expect((await intruder.get(`/api/syllabus-revisions/${crypto.randomUUID()}`)).status).toBe(404);
  });
});
