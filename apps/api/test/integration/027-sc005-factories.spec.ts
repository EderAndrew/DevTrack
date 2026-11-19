import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClass, createEnrollment, createSubject, createUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 027/SC-005: the 004–026 suites keep passing with the disciplina da turma in the place of the 003 turma (checked by
 * the full suite, T065). What they stand on is pinned here: `createClass` builds a turma behind each class (created by
 * the teacher, as the transition does) and returns its fields with the class; `createEnrollment` enrolls in that turma,
 * and the pedagogical readers see the student through the view `class_enrollments` of every disciplina of the turma.
 */
describe("027/SC-005 as factories das suítes 004–026 criam a disciplina da turma com a turma por trás", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  it("027/SC-005 createClass cria a turma e devolve os campos dela; a matrícula vale para todas as disciplinas da turma", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const other = await createUser(t, { roles: ["TEACHER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    const subject = await createSubject(t, teacher.id);

    const schoolClass = await createClass(t, teacher.id, { name: "ADS 3NA", code: "ADS-3NA", subjectId: subject.id });
    const cohort = await t.prisma.cohort.findUniqueOrThrow({ where: { id: schoolClass.cohortId } });
    expect(cohort).toMatchObject({ name: "ADS 3NA", code: "ADS-3NA", createdById: teacher.id, status: "ACTIVE" });
    expect(schoolClass).toMatchObject({ name: "ADS 3NA", code: "ADS-3NA", academicYear: cohort.academicYear });

    // A second disciplina of the same turma, of another teacher: the one enrollment reaches both.
    const second = await createClass(t, other.id, { cohortId: cohort.id });
    const enrollment = await createEnrollment(t, schoolClass.id, student.id);
    expect(enrollment.cohortId).toBe(cohort.id);

    const rows = await t.prisma.$queryRaw<{ class_id: string }[]>`
      SELECT class_id::text FROM class_enrollments
      WHERE student_user_id = ${student.id}::uuid AND status = 'ACTIVE'
      ORDER BY class_id`;
    expect(rows.map((row) => row.class_id).sort()).toEqual([schoolClass.id, second.id].sort());
  });
});
