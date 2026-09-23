import { expect, test } from "@playwright/test";
import { acceptClassInvitation, classTeacher, inviteToClass, logIn, newAccount } from "./fixtures/journeys.ts";

// 003 SC-010, journey 2: a new student opens the e-mail of the invitation, creates the account
// with name, RA and password only, and lands in "Minhas turmas"; the teacher sees the student.
test("003/SC-010 003/US3-2 aluno novo aceita o convite criando a conta e vê a turma", async ({ page, browser }) => {
  const student = newAccount("aluno-novo", "Aluna Nova E2E");
  await inviteToClass(browser, student);

  await acceptClassInvitation(page, student);
  await expect(page.getByRole("heading", { level: 1, name: "Minhas turmas" })).toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Turma E2E", exact: true }) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Professora da Turma E2E")).toBeVisible();

  const teacher = classTeacher();
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, teacher, `/turmas/${teacher.classId}`);
  await teacherPage.getByLabel("Pesquisar por nome ou RA").fill(student.name);
  await teacherPage.getByRole("button", { name: "Pesquisar" }).click();
  await expect(teacherPage.getByRole("row").filter({ hasText: student.email })).toBeVisible();
});
