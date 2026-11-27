import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { createExam } from "../helpers/exams";
import { createUser, DEFAULT_PASSWORD } from "../helpers/factories";
import { createTestApp, resetDb } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * Seed of the exam load test (not a spec): a teacher, a class of LOAD_STUDENTS students and an APPROVED exam of
 * 10 questions (4 multiple choice, 3 open answer, 3 code) in a database of its own. Writes the ids and e-mails to
 * LOAD_SEED_OUT for `test/load/exam-load.mjs`.
 */
describe("load seed", () => {
  it("creates the class and the exam", async () => {
    const out = process.env.LOAD_SEED_OUT;
    expect(out, "LOAD_SEED_OUT").toBeTruthy();
    const count = Number(process.env.LOAD_STUDENTS ?? 50);
    const t = await createTestApp();
    try {
      await resetDb(t.prisma);
      const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Carga" });
      const syllabus = await createConfirmedSyllabus(t, teacher.id);
      const { schoolClass, students } = await createClassWithStudents(t, teacher.id, {
        subjectId: syllabus.subject.id,
        students: count,
      });
      const exam = await createExam(t, teacher.id, {
        syllabus,
        title: "Prova de carga",
        totalGrade: "10.00",
        questions: [
          {},
          {},
          {},
          {},
          { type: "OPEN_ANSWER" },
          { type: "OPEN_ANSWER" },
          { type: "OPEN_ANSWER" },
          { type: "CODE" },
          { type: "CODE" },
          { type: "CODE" },
        ],
      });
      writeFileSync(
        out!,
        JSON.stringify(
          {
            password: DEFAULT_PASSWORD,
            teacherEmail: teacher.email,
            classId: schoolClass.id,
            examId: exam.id,
            students: students.map((student) => student.email),
          },
          null,
          2,
        ),
      );
    } finally {
      await t.close();
    }
  }, 300_000);
});
