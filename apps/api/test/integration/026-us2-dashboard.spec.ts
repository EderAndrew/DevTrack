import type { StudentDashboard } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 026/US2 — the Painel of one subject (research D4): with `classId`, the counters, "Próximas atividades",
 * "Atrasadas — ainda aceitam entrega" and the ranking come from that class only; without it, the dashboard answers as
 * before 026.
 */

const START = "2026-11-16T12:00:00.000Z";

describe("026/US2 painel do aluno por matéria", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: ReturnType<typeof api>;
  let teacherId: string;
  let studentId: string;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let foreign: SchoolClass;
  let work: WorkFixture;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const assignment = (schoolClass: SchoolClass, title: string, publishAt: number, dueIn: number) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(publishAt),
      deadline: at(dueIn),
      latePolicy: "ACCEPT_MARKED",
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
    });
  const get = (query = "") => client.get(`/api/me/dashboard${query}`);
  const dashboard = async (query = "") => {
    const res = await get(query);
    expect(res.status).toBe(200);
    return res.body as StudentDashboard;
  };
  const titles = (items: { title: string }[]) => items.map((item) => item.title).sort();

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherId = teacher.id;
    const student = await createUser(t, { roles: ["STUDENT"] });
    studentId = student.id;
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

    await assignment(classA, "A — Próxima 1", -DAY, DAY);
    await assignment(classA, "A — Próxima 2", -DAY, 2 * DAY);
    await assignment(classA, "A — Atrasada", -3 * DAY, -DAY);
    await assignment(classB, "B — Próxima", -DAY, DAY);
    await assignment(classB, "B — Atrasada 1", -3 * DAY, -DAY);
    await assignment(classB, "B — Atrasada 2", -4 * DAY, -2 * DAY);
    await assignment(foreign, "Alheia", -DAY, DAY);
  });

  it("026/US2-1 026/US2-2 com a turma A, contadores, próximas e atrasadas só dela; com B, só as de B", async () => {
    const a = await dashboard(`?classId=${classA.id}`);
    expect(a.counts).toEqual({ pending: 2, inProgress: 0, overdue: 1, completed: 0 });
    expect(titles(a.next)).toEqual(["A — Próxima 1", "A — Próxima 2"]);
    expect(titles(a.overdueOpen)).toEqual(["A — Atrasada"]);
    expect([...a.next, ...a.overdueOpen].every((item) => item.class.id === classA.id)).toBe(true);

    const b = await dashboard(`?classId=${classB.id}`);
    expect(b.counts).toEqual({ pending: 1, inProgress: 0, overdue: 2, completed: 0 });
    expect(titles(b.next)).toEqual(["B — Próxima"]);
    expect(titles(b.overdueOpen)).toEqual(["B — Atrasada 1", "B — Atrasada 2"]);
    expect([...b.next, ...b.overdueOpen].every((item) => item.class.id === classB.id)).toBe(true);
    expect(JSON.stringify(b)).not.toContain(classA.id);
  });

  it("026/US2-3 o ranking traz só o bloco da turma escolhida; vazio sem a permissão e para turma inativa ou arquivada", async () => {
    const a = await dashboard(`?classId=${classA.id}`);
    expect(a.rankings.map((block) => block.class.id)).toEqual([classA.id]);
    expect(a.rankings[0]!.top.some((row) => row.isViewer)).toBe(true);
    expect((await dashboard(`?classId=${classB.id}`)).rankings.map((block) => block.class.id)).toEqual([classB.id]);

    const grant = await t.prisma.rolePermission.findFirstOrThrow({
      where: { role: { key: "STUDENT" }, permission: { key: "ranking.turma.visualizar" } },
    });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
    try {
      expect((await dashboard(`?classId=${classA.id}`)).rankings).toEqual([]);
    } finally {
      await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
    }

    for (const status of ["INACTIVE", "ARCHIVED"] as const) {
      const closed = await createClass(t, teacherId, { name: `Turma ${status}`, status });
      await createEnrollment(t, closed.id, studentId);
      expect((await dashboard(`?classId=${closed.id}`)).rankings).toEqual([]);
    }
  });

  it("026/FR-009 turma sem matrícula ativa do aluno → 404; classId mal formado ou parâmetro desconhecido → 400", async () => {
    const outside = await get(`?classId=${foreign.id}`);
    expect(outside.status).toBe(404);
    expect(outside.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
    expect(JSON.stringify(outside.body)).not.toContain("Alheia");

    const malformed = await get("?classId=abc");
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_ERROR");
    expect((await get("?status=PENDING")).status).toBe(400);
  });

  it("026/SC-005 sem classId, o painel responde como antes da 026: as duas turmas e um bloco de ranking por turma ativa", async () => {
    const all = await dashboard();
    expect(all.counts).toEqual({ pending: 3, inProgress: 0, overdue: 3, completed: 0 });
    expect(titles(all.overdueOpen)).toEqual(["A — Atrasada", "B — Atrasada 1", "B — Atrasada 2"]);
    expect(all.rankings.map((block) => block.class.id).sort()).toEqual([classA.id, classB.id].sort());
    expect(JSON.stringify(all)).not.toContain("Alheia");
  });
});
