import { expect, test } from "@playwright/test";
import {
  classTeacher,
  createClassThroughForm,
  createEnrolledStudent,
  field,
  inviteToClass,
  logIn,
} from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";

// 003 SC-010, journey 3: a student who already has an account is invited to a second class,
// signs in from the invitation and accepts it without creating anything new.
test("003/SC-010 003/US4-1 aluno existente entra, aceita o convite da segunda turma e vê as duas", async ({ page, browser }) => {
  const student = await createEnrolledStudent(page, "aluno-existente", "Aluno Existente E2E");

  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, classTeacher(), "/turmas");
  const secondClassId = await createClassThroughForm(teacherPage, "Segunda Turma E2E");
  await teacherPage.context().close();
  await inviteToClass(browser, student, secondClassId);

  await page.goto(await waitForLink(student.email, { path: "/convite-turma" }));
  await expect(page.getByText("Segunda Turma E2E")).toBeVisible();
  await page.getByRole("link", { name: "Entrar para aceitar" }).click();
  await expect(page).toHaveURL(/\/entrar\?next=/);
  await field(page, "E-mail").fill(student.email);
  await field(page, "Senha").fill(student.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  // Back on the invitation, signed in with the invited account: one button, no password or RA.
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page).toHaveURL("/minhas-turmas?bem-vindo=1");
  await expect(page.getByRole("heading", { name: "Você agora faz parte da turma." })).toBeVisible();
  for (const name of ["Turma E2E", "Segunda Turma E2E"]) {
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  }
});
