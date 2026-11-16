import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createEnrollment, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 026/US4 — "Minhas turmas" carries each class's subject name (`subjectName`), in the order of 003/US7 (most recent
 * enrollment first); a class without a subject answers `null`. The 003/US7 suite keeps the rest of the shape.
 */

describe("026/US4 Minhas turmas com a disciplina", () => {
  let t: TestApp;
  let teacher: TestUser;
  let student: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    student = await createUser(t, { name: "Aluna Bia", ra: "RA-1" });
  });

  const enroll = async (classId: string, days: number) => {
    const enrollment = await createEnrollment(t, classId, student.id);
    await t.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { enrolledAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    });
  };
  const myClasses = async () => {
    const res = await api(t, { cookie: await loginAs(t, student) }).get("/api/me/classes");
    expect(res.status).toBe(200);
    return (res.body as { items: { id: string; subjectName: string | null }[] }).items;
  };

  it("026/US4-1 cada turma traz o nome da sua disciplina, na ordem de hoje", async () => {
    const poo = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const bd = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    const classPoo = await createClass(t, teacher.id, { name: "ADS 3NA", subjectId: poo.id });
    const classBd = await createClass(t, teacher.id, { name: "ADS 3NA — SQL", subjectId: bd.id });
    await enroll(classPoo.id, 2);
    await enroll(classBd.id, 1);

    expect((await myClasses()).map(({ id, subjectName }) => ({ id, subjectName }))).toEqual([
      { id: classBd.id, subjectName: "Banco de Dados" },
      { id: classPoo.id, subjectName: "Programação Orientada a Objetos" },
    ]);
  });

  it("026/US4-2 turma sem disciplina → subjectName null", async () => {
    const poo = await createSubject(t, teacher.id, { name: "POO" });
    const withSubject = await createClass(t, teacher.id, { name: "ADS 3NA", subjectId: poo.id });
    const without = await createClass(t, teacher.id, { name: "Turma antiga" });
    await enroll(withSubject.id, 2);
    await enroll(without.id, 1);

    expect((await myClasses()).map(({ id, subjectName }) => ({ id, subjectName }))).toEqual([
      { id: without.id, subjectName: null },
      { id: withSubject.id, subjectName: "POO" },
    ]);
  });
});
