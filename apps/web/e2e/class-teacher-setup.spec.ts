import { expect, test } from "@playwright/test";
import {
  acceptInvitationWithPassword,
  bootstrapAdmin,
  field,
  invite,
  logIn,
  newAccount,
  saveClassTeacher,
} from "./fixtures/journeys.ts";

// Starts from the ADMIN activated by admin-manager.spec.ts (project dependency in playwright.config.ts).
// Students exist only through a class invitation (003 FR-048): this teacher and class serve every
// journey that needs a student (createEnrolledStudent).
test("003/US1-1 ADMIN convida professor → aceite → professor cria a turma da execução", async ({ browser }) => {
  const admin = bootstrapAdmin();
  const teacher = newAccount("professor-turma", "Professora da Turma E2E");

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, admin, "/professores");
  await invite(adminPage, "/professores", teacher);

  const teacherPage = await (await browser.newContext()).newPage();
  await acceptInvitationWithPassword(teacherPage, teacher);
  await logIn(teacherPage, teacher, "/turmas/nova");
  await field(teacherPage, "Nome").fill("Turma E2E");
  await field(teacherPage, "Código").fill(`E2E-${Date.now()}`);
  await teacherPage.getByRole("button", { name: "Criar turma" }).click();
  await expect(teacherPage).toHaveURL(/\/turmas\/[0-9a-f-]{36}$/);
  await expect(teacherPage.getByRole("heading", { level: 1, name: "Turma E2E" })).toBeVisible();

  const classId = new URL(teacherPage.url()).pathname.split("/").at(-1)!;
  saveClassTeacher({ ...teacher, classId });
});
