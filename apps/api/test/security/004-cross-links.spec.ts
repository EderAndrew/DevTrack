import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createSubject,
  createSyllabusDocument,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { buildTeacherArea, curriculumSnapshot, PERIOD, type TeacherArea } from "./004-curriculum-authorization-matrix";

/**
 * 004/US8-3: a request that links the teacher's own resource to another teacher's (or to one
 * outside its parent) is refused as if the other resource did not exist, and changes nothing.
 */
describe("004/US8-3 ligações cruzadas recusadas sem efeito", () => {
  let t: TestApp;
  let owner: TestUser;
  let mine: TeacherArea;
  let theirs: TeacherArea;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    owner = await createUser(t, { roles: ["TEACHER"] });
    mine = await buildTeacherArea(t, owner);
    theirs = await buildTeacherArea(t, await createUser(t, { roles: ["TEACHER"] }));
    client = api(t, { cookie: await loginAs(t, owner) });
  });

  /** Calls `request` and expects `status`/`code` with every 004 row and the classes unchanged. */
  async function refused(request: () => Promise<{ status: number; body: { code?: string } }>, status: number, code: string) {
    const before = { ...(await curriculumSnapshot(t)), classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }) };
    const res = await request();
    expect({ status: res.status, code: res.body.code }).toEqual({ status, code });
    expect({ ...(await curriculumSnapshot(t)), classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }) }).toEqual(
      before,
    );
  }

  const planRevision = async () => (await t.prisma.classPlan.findUniqueOrThrow({ where: { id: mine.planId } })).revision;

  it("turma própria com disciplina alheia (criar e editar) → 404", async () => {
    await refused(
      () =>
        client.post("/api/classes", { name: "Invasora", code: "INV-1", academicYear: 2027, subjectId: theirs.subjectId, ...PERIOD }),
      404,
      "NOT_FOUND",
    );
    // A class without a plan yet, so FR-004 does not lock its subject.
    const fresh = await createClass(t, owner.id);
    await refused(() => client.patch(`/api/classes/${fresh.id}`, { subjectId: theirs.subjectId }), 404, "NOT_FOUND");
  });

  it("seleção de revisão alheia, ou de outra disciplina própria, para o planejamento → 404", async () => {
    await refused(
      async () => client.put(`/api/classes/${mine.classId}/plan/syllabus`, { planRevision: await planRevision(), revisionId: theirs.confirmedRevisionId }),
      404,
      "NOT_FOUND",
    );
    const otherSubject = await createSubject(t, owner.id);
    const otherDocument = await createSyllabusDocument(t, otherSubject.id, { status: "PROCESSED" });
    const otherRevision = await createConfirmedRevision(t, otherDocument.id, [{ items: ["Outro"] }]);
    await refused(
      async () => client.put(`/api/classes/${mine.classId}/plan/syllabus`, { planRevision: await planRevision(), revisionId: otherRevision.revision.id }),
      404,
      "NOT_FOUND",
    );
  });

  it("tópico com item de ementa alheia → 404; com item de outra versão própria → 422", async () => {
    await refused(
      async () =>
        client.post(`/api/classes/${mine.classId}/plan/topics`, { planRevision: await planRevision(), title: "X", itemIds: [theirs.itemIds[0]] }),
      404,
      "NOT_FOUND",
    );
    const newer = await createSyllabusDocument(t, mine.subjectId, { status: "PROCESSED", fixture: "poo.pdf" });
    const newerRevision = await createConfirmedRevision(t, newer.id, [{ items: ["Só na versão nova"] }]);
    await refused(
      async () =>
        client.post(`/api/classes/${mine.classId}/plan/topics`, {
          planRevision: await planRevision(),
          title: "X",
          itemIds: [newerRevision.itemIds[0]],
        }),
      422,
      "SYLLABUS_ITEM_NOT_IN_PLAN",
    );
  });

  it("tópico com encontro de outra turma (própria ou alheia) → 404", async () => {
    const sibling = await buildTeacherArea(t, owner);
    for (const meetingId of [sibling.meetingIds[0], theirs.meetingIds[0]]) {
      await refused(
        async () => client.post(`/api/classes/${mine.classId}/plan/topics`, { planRevision: await planRevision(), title: "X", itemIds: [], meetingId }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("resolução do calendário com tópico de outra turma (MOVE) ou juntando num tópico de outro planejamento (MERGE) → 404", async () => {
    const sibling = await buildTeacherArea(t, owner);
    const save = async (resolutions: object[]) =>
      client.put(`/api/classes/${mine.classId}/meetings`, {
        planRevision: await planRevision(),
        add: [],
        remove: ["2027-02-03"],
        resolutions,
      });

    for (const topicId of [sibling.topicId, theirs.topicId]) {
      await refused(() => save([{ topicId, action: "MOVE", meetingDate: "2027-02-10" }]), 404, "NOT_FOUND");
    }
    for (const intoTopicId of [sibling.topicId, theirs.topicId]) {
      await refused(() => save([{ topicId: mine.topicId, action: "MERGE", intoTopicId }]), 404, "NOT_FOUND");
    }
  });

  it("tópico de outro planejamento (próprio ou alheio) nas rotas de tópico da turma → 404", async () => {
    const sibling = await buildTeacherArea(t, owner);
    const base = `/api/classes/${mine.classId}/plan`;
    for (const foreign of [sibling.topicId, theirs.topicId]) {
      await refused(async () => client.patch(`${base}/topics/${foreign}`, { planRevision: await planRevision(), title: "X" }), 404, "NOT_FOUND");
      for (const action of ["archive", "restore"]) {
        await refused(async () => client.post(`${base}/topics/${foreign}/${action}`, { planRevision: await planRevision() }), 404, "NOT_FOUND");
      }
      await refused(
        async () =>
          client.post(`${base}/topics/${foreign}/split`, {
            planRevision: await planRevision(),
            parts: [
              { title: "A", itemIds: [] },
              { title: "B", itemIds: [] },
            ],
          }),
        404,
        "NOT_FOUND",
      );
      // "Juntar tópicos" with a topic of another plan.
      await refused(
        async () =>
          client.post(`${base}/topics/merge`, { planRevision: await planRevision(), topicIds: [mine.topicId, foreign], title: "X", itemIds: [] }),
        404,
        "NOT_FOUND",
      );
    }
  });

  it("revisão nova a partir de revisão confirmada de outro documento → recusada sem efeito", async () => {
    await refused(
      () =>
        client.post(`/api/syllabus-documents/${mine.documentId}/revisions`, {
          source: "REVISION",
          basedOnRevisionId: theirs.confirmedRevisionId,
        }),
      404,
      "NOT_FOUND",
    );
  });
});
