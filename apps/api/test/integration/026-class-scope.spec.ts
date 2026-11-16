import type { StudentActivityPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 026 — the class scope of the student's reads (research D2, D3): `classId` narrows "Minhas atividades" to one
 * class of the student's ACTIVE enrollments; any other well-formed id is a plain 404 and a malformed one a 400
 * before the database; without `classId` the list answers as before 026.
 */

const START = "2026-11-16T12:00:00.000Z";

describe("026 escopo por turma na leitura do aluno", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let foreign: SchoolClass;
  let work: WorkFixture;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const assignment = (schoolClass: SchoolClass, title: string, dueIn: number) =>
    createActivity(t, schoolClass, {
      title,
      publishAt: at(-DAY),
      deadline: at(dueIn),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
    }).then((created) => created.activity);
  const list = (query = "") => client.get(`/api/me/activities${query}`);

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"] });
    const other = await createUser(t, { roles: ["STUDENT"] });
    client = api(t, { cookie: await loginAs(t, student) });
    const poo = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus: poo });
    classA = await createClass(t, teacher.id, { name: "ADS 3NA", subjectId: poo.subject.id });
    classB = await createClass(t, teacher.id, { name: "ADS 3NA — SQL" });
    foreign = await createClass(t, teacher.id, { name: "Outra turma" });
    await createEnrollment(t, classA.id, student.id);
    await createEnrollment(t, classB.id, student.id);
    await createEnrollment(t, foreign.id, other.id);
    await assignment(classA, "Trabalho de POO", 2 * DAY);
    await assignment(classB, "Trabalho de SQL", 3 * DAY);
    await assignment(foreign, "Trabalho alheio", DAY);
  });

  it("026/FR-008 com classId, só as atividades daquela turma; com a outra, só as dela", async () => {
    const onlyA = await list(`?classId=${classA.id}`);
    expect(onlyA.status).toBe(200);
    const pageA = onlyA.body as StudentActivityPage;
    expect(pageA.items.map((item) => item.title)).toEqual(["Trabalho de POO"]);
    expect(pageA.items.every((item) => item.class.id === classA.id)).toBe(true);

    const pageB = (await list(`?classId=${classB.id}`)).body as StudentActivityPage;
    expect(pageB.items.map((item) => item.title)).toEqual(["Trabalho de SQL"]);
  });

  it("026/FR-009 turma sem matrícula ativa do aluno → 404 sem atividades; classId mal formado → 400", async () => {
    const outside = await list(`?classId=${foreign.id}`);
    expect(outside.status).toBe(404);
    expect(outside.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
    expect(JSON.stringify(outside.body)).not.toContain("Trabalho alheio");

    const malformed = await list("?classId=abc");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_ERROR");
  });

  it("026/SC-005 sem classId, a lista responde como antes da 026: as duas turmas, na ordem do prazo", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const page = res.body as StudentActivityPage;
    expect(page.items.map((item) => item.title)).toEqual(["Trabalho de POO", "Trabalho de SQL"]);
    expect(page.items.map((item) => item.title)).not.toContain("Trabalho alheio");
  });
});
