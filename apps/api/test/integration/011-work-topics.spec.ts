import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WorkTopics } from "../../src/modules/works/work-topics";
import { AppException } from "../../src/platform/http/errors";
import { createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

/**
 * 011 research W11: the topics of a work are items of one confirmed revision of a subject the
 * teacher owns; anything else is 404 without revealing whether it exists, a draft revision 422.
 */
describe("011/FR-006 tópicos do trabalho resolvidos no escopo do professor (research W11)", () => {
  let t: TestApp;
  let topics: WorkTopics;
  let teacherId: string;
  let syllabus: ConfirmedSyllabus;

  beforeAll(async () => {
    t = await createTestApp();
    topics = t.get(WorkTopics);
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    syllabus = await createConfirmedSyllabus(t, teacherId);
  });

  const selection = (itemIds: string[], revisionId = syllabus.revision.id) => ({ syllabusRevisionId: revisionId, syllabusItemIds: itemIds });
  const notFound = new AppException("NOT_FOUND");

  it("devolve a disciplina, a revisão com a linguagem e os tópicos na ordem escolhida, com o grupo", async () => {
    const [heranca, polimorfismo, , listas] = syllabus.itemIds;
    const resolved = await topics.resolve(teacherId, syllabus.subject.id, selection([listas!, heranca!, polimorfismo!]));
    expect(resolved.subject).toMatchObject({ id: syllabus.subject.id, status: "ACTIVE" });
    expect(resolved.revision).toEqual({ id: syllabus.revision.id, languageId: syllabus.languageId, languageName: "Java" });
    expect(resolved.topics).toEqual([
      { syllabusItemId: listas, itemText: "Listas", groupTitle: "Coleções" },
      { syllabusItemId: heranca, itemText: "Herança", groupTitle: "Orientação a objetos" },
      { syllabusItemId: polimorfismo, itemText: "Polimorfismo", groupTitle: "Orientação a objetos" },
    ]);
  });

  it("sem tópicos: só a disciplina do professor", async () => {
    const resolved = await topics.resolve(teacherId, syllabus.subject.id, null);
    expect(resolved).toMatchObject({ revision: null, topics: [] });
  });

  it("disciplina de outro professor ou inexistente → 404", async () => {
    const other = (await createUser(t, { roles: ["TEACHER"] })).id;
    await expect(topics.resolve(other, syllabus.subject.id, null)).rejects.toThrow(notFound);
    await expect(topics.resolve(other, syllabus.subject.id, selection([syllabus.itemIds[0]!]))).rejects.toThrow(notFound);
    await expect(topics.resolve(teacherId, "0d4e5f60-7a8b-4c9d-8e0f-112233445566", null)).rejects.toThrow(notFound);
  });

  it("item de outra revisão, de outra disciplina ou inexistente → 404", async () => {
    const otherSyllabus = await createConfirmedSyllabus(t, teacherId);
    const first = syllabus.itemIds[0]!;
    await expect(topics.resolve(teacherId, syllabus.subject.id, selection([first, otherSyllabus.itemIds[0]!]))).rejects.toThrow(notFound);
    await expect(
      topics.resolve(teacherId, syllabus.subject.id, selection([otherSyllabus.itemIds[0]!], otherSyllabus.revision.id)),
    ).rejects.toThrow(notFound);
    await expect(topics.resolve(teacherId, syllabus.subject.id, selection([first, "0d4e5f60-7a8b-4c9d-8e0f-112233445566"]))).rejects.toThrow(
      notFound,
    );
  });

  it("revisão em rascunho → 422 REVISION_NOT_CONFIRMED", async () => {
    const draft = await t.prisma.syllabusRevision.create({
      data: { documentId: syllabus.document.id, number: 2, status: "DRAFT", source: "MANUAL" },
    });
    const group = await t.prisma.syllabusGroup.create({ data: { revisionId: draft.id, position: 1, title: null } });
    const item = await t.prisma.syllabusItem.create({ data: { revisionId: draft.id, groupId: group.id, position: 1, text: "Rascunho" } });
    await expect(topics.resolve(teacherId, syllabus.subject.id, selection([item.id], draft.id))).rejects.toThrow(
      new AppException("REVISION_NOT_CONFIRMED"),
    );
  });
});
