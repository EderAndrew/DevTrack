import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  dbDate,
} from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const POO_GROUPS = [
  { title: "Fundamentos de POO", items: ["Classes e objetos", "Encapsulamento"] },
  { title: "Padrões de Design em POO", items: ["SOLID"] },
];

/** Tables added by 004 (the class columns are checked through `classes`). */
const TABLES_004 = [
  "subjects",
  "stored_files",
  "syllabus_documents",
  "syllabus_revisions",
  "syllabus_groups",
  "syllabus_items",
  "class_meetings",
  "class_plans",
  "topics",
  "topic_syllabus_items",
];

// 004 data-model.md: the rules the migration enforces in SQL (indexes, CHECKs, triggers,
// deferred constraints), exercised through the test factories.
describe("004 schema: fábricas, resetDb e regras do banco", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  async function plannedClass() {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const schoolClass = await createClass(t, teacher.id, {
      subjectId: subject.id,
      startsOn: "2027-02-01",
      endsOn: "2027-06-30",
    });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, POO_GROUPS);
    const meetings = await createMeetings(t, schoolClass.id, ["2027-02-03", "2027-02-01", "2027-02-05"]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id);
    return { teacher, subject, schoolClass, document, confirmed, meetings, plan };
  }

  const count = async (table: string) =>
    Number((await t.prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`))[0]!.n);

  it("as fábricas montam o grafo completo e o resetDb limpa as tabelas novas", async () => {
    const { schoolClass, document, confirmed, meetings, plan } = await plannedClass();
    const topic = await createTopic(t, plan.id, { meetingId: meetings[0]!.id, itemIds: confirmed.itemIds.slice(0, 2) });

    expect(schoolClass.startsOn).toEqual(dbDate("2027-02-01"));
    expect(document).toMatchObject({ version: 1, processingStatus: "PROCESSED", extractionResult: "TEXT", mediaType: "PDF" });
    expect(confirmed.revision).toMatchObject({ number: 1, status: "CONFIRMED" });
    expect(confirmed.groups.map((group) => group.itemIds.length)).toEqual([2, 1]);
    expect(meetings.map((meeting) => meeting.meetingDate.toISOString().slice(0, 10))).toEqual([
      "2027-02-01",
      "2027-02-03",
      "2027-02-05",
    ]);
    expect(topic).toMatchObject({ status: "DRAFT", position: 1, origin: "MANUAL" });
    for (const table of TABLES_004) expect(await count(table), table).toBeGreaterThan(0);

    await resetDb(t.prisma);
    for (const table of TABLES_004) expect(await count(table), table).toBe(0);
  });

  it("nome da disciplina é único por professor ignorando maiúsculas; outro professor pode repetir", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const other = await createUser(t, { roles: ["TEACHER"] });
    await createSubject(t, teacher.id, { name: "Banco de Dados" });
    await expect(createSubject(t, teacher.id, { name: "BANCO DE DADOS" })).rejects.toThrow();
    await expect(createSubject(t, other.id, { name: "Banco de Dados" })).resolves.toBeTruthy();
  });

  it("período da turma: as duas datas ou nenhuma, e término não antes do início", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    await expect(createClass(t, teacher.id, { startsOn: "2027-06-30", endsOn: "2027-02-01" })).rejects.toThrow();
    await expect(createClass(t, teacher.id, { startsOn: "2027-02-01" })).rejects.toThrow();
    await expect(createClass(t, teacher.id, { startsOn: "2027-02-01", endsOn: "2027-02-01" })).resolves.toBeTruthy();
  });

  it("o mesmo arquivo não vira nova versão da mesma disciplina (FR-011)", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    await createSyllabusDocument(t, subject.id);
    await expect(createSyllabusDocument(t, subject.id)).rejects.toThrow();
    expect(await t.prisma.storedFile.count()).toBe(1);
  });

  it("004/SC-004 revisão confirmada, seus grupos e itens não mudam", async () => {
    const { confirmed } = await plannedClass();
    const id = confirmed.revision.id;
    const groupId = confirmed.groups[0]!.id;

    await expect(t.prisma.syllabusRevision.update({ where: { id }, data: { title: "Outro" } })).rejects.toThrow(/immutable/);
    await expect(t.prisma.syllabusRevision.delete({ where: { id } })).rejects.toThrow(/immutable/);
    await expect(t.prisma.syllabusGroup.update({ where: { id: groupId }, data: { title: "X" } })).rejects.toThrow(
      /immutable/,
    );
    await expect(
      t.prisma.syllabusItem.create({ data: { revisionId: id, groupId, position: 9, text: "Novo" } }),
    ).rejects.toThrow(/immutable/);
    await expect(t.prisma.syllabusItem.delete({ where: { id: confirmed.itemIds[0]! } })).rejects.toThrow(/immutable/);
  });

  it("rascunho: um por documento, editável, e item só no grupo da própria revisão", async () => {
    const { document, confirmed } = await plannedClass();
    const draft = await t.prisma.syllabusRevision.create({
      data: { documentId: document.id, number: 2, status: "DRAFT", source: "MANUAL" },
    });
    await expect(
      t.prisma.syllabusRevision.create({ data: { documentId: document.id, number: 3, status: "DRAFT", source: "MANUAL" } }),
    ).rejects.toThrow();

    const group = await t.prisma.syllabusGroup.create({ data: { revisionId: draft.id, position: 1 } });
    await t.prisma.syllabusItem.create({ data: { revisionId: draft.id, groupId: group.id, position: 1, text: "Item" } });
    await t.prisma.syllabusRevision.update({ where: { id: draft.id }, data: { title: "Revisão 2" } });
    await t.prisma.syllabusItem.deleteMany({ where: { revisionId: draft.id } });

    // Composite FK: the group of a confirmed revision cannot hold an item of the draft.
    await expect(
      t.prisma.syllabusItem.create({
        data: { revisionId: draft.id, groupId: confirmed.groups[0]!.id, position: 1, text: "Item" },
      }),
    ).rejects.toThrow();
  });

  it("revisão confirmada exige data e autor juntos; origem REVISION exige a revisão base", async () => {
    const { document } = await plannedClass();
    await expect(
      t.prisma.syllabusRevision.create({
        data: { documentId: document.id, number: 5, status: "CONFIRMED", source: "MANUAL", confirmedAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      t.prisma.syllabusRevision.create({ data: { documentId: document.id, number: 6, status: "DRAFT", source: "REVISION" } }),
    ).rejects.toThrow();
  });

  it("004/SC-008 encontro com tópico não pode ser apagado; sem tópico, pode", async () => {
    const { meetings, plan } = await plannedClass();
    await createTopic(t, plan.id, { meetingId: meetings[0]!.id });
    await expect(t.prisma.classMeeting.delete({ where: { id: meetings[0]!.id } })).rejects.toThrow();
    await expect(t.prisma.classMeeting.delete({ where: { id: meetings[1]!.id } })).resolves.toBeTruthy();
    await expect(createMeetings(t, plan.classId, ["2027-02-05"])).rejects.toThrow();
  });

  it("posições de tópicos: únicas no planejamento, mas trocáveis dentro de uma transação", async () => {
    const { plan } = await plannedClass();
    const first = await createTopic(t, plan.id);
    const second = await createTopic(t, plan.id);
    await expect(createTopic(t, plan.id, { position: 1 })).rejects.toThrow();

    await t.prisma.$transaction([
      t.prisma.topic.update({ where: { id: first.id }, data: { position: 2 } }),
      t.prisma.topic.update({ where: { id: second.id }, data: { position: 1 } }),
    ]);
    const order = await t.prisma.topic.findMany({ where: { planId: plan.id }, orderBy: { position: "asc" } });
    expect(order.map((topic) => topic.id)).toEqual([second.id, first.id]);
  });

  it("tópico arquivado exige archivedAt, e só ele", async () => {
    const { plan } = await plannedClass();
    const archived = await createTopic(t, plan.id, { status: "ARCHIVED" });
    expect(archived).toMatchObject({ status: "ARCHIVED", statusBeforeArchive: "ACTIVE" });
    await expect(t.prisma.topic.update({ where: { id: archived.id }, data: { archivedAt: null } })).rejects.toThrow();
    const active = await createTopic(t, plan.id);
    await expect(t.prisma.topic.update({ where: { id: active.id }, data: { archivedAt: new Date() } })).rejects.toThrow();
  });
});
