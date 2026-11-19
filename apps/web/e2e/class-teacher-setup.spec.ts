import { expect, test } from "@playwright/test";
import { createSubject, unique } from "./fixtures/curriculum.ts";
import {
  acceptInvitationWithPassword,
  addClassThroughForm,
  bootstrapAdmin,
  createCohortThroughForm,
  invite,
  logIn,
  newAccount,
  saveClassTeacher,
} from "./fixtures/journeys.ts";

// Starts from the ADMIN activated by admin-manager.spec.ts (project dependency in playwright.config.ts).
// Students exist only through a class invitation (003 FR-048), which since 027 the turma's manager sends: the ADMIN
// (MANAGER function) creates the turma of the run, the teacher adds a subject to it, and every journey that needs a
// student is invited to that turma (createEnrolledStudent).
test("003/US1-1 027/US1-1 ADMIN convida professor e cria a turma da execução → professor acrescenta a sua disciplina", async ({ browser }) => {
  const admin = bootstrapAdmin();
  const teacher = newAccount("professor-turma", "Professora da Turma E2E");
  const cohortName = "Turma E2E";
  const subjectName = `Disciplina da Turma E2E ${unique()}`;

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, admin, "/professores");
  await invite(adminPage, "/professores", teacher);
  const cohortId = await createCohortThroughForm(adminPage, cohortName);
  await adminPage.context().close();

  const teacherPage = await (await browser.newContext()).newPage();
  await acceptInvitationWithPassword(teacherPage, teacher);
  await logIn(teacherPage, teacher, "/disciplinas");
  await createSubject(teacherPage, subjectName);
  const classId = await addClassThroughForm(teacherPage, cohortName, cohortName, subjectName);
  await expect(teacherPage.getByRole("heading", { level: 1, name: `${subjectName} · ${cohortName}` })).toBeVisible();

  saveClassTeacher({ ...teacher, classId, cohortId, cohortName, subjectName });
});
