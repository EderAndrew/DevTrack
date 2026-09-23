import { expect, test } from "@playwright/test";
import { classTeacher, createEnrolledStudent, logIn } from "./fixtures/journeys.ts";

// 003 SC-010, journey 4: the teacher removes a student; the enrollment stays as removed and the
// student still signs in, now without the class in "Minhas turmas".
test("003/SC-010 003/US6-3 professor remove o aluno; matrícula removida; o aluno ainda entra no sistema", async ({ page, browser }) => {
  const student = await createEnrolledStudent(page, "aluno-removido", "Aluno Removido E2E");
  const teacher = classTeacher();

  await logIn(page, teacher, `/turmas/${teacher.classId}`);
  const search = page.getByLabel("Pesquisar por nome ou RA");
  await search.fill(student.name);
  await page.getByRole("button", { name: "Pesquisar" }).click();
  await page.getByRole("button", { name: `Remover ${student.name} da turma` }).click();
  const dialog = page.getByRole("alertdialog", { name: `Remover ${student.name} da turma?` });
  await dialog.getByRole("button", { name: "Remover aluno" }).click();
  await expect(page.getByText("Aluno removido.")).toBeVisible();

  await page.getByRole("combobox", { name: "Situação" }).click();
  await page.getByRole("option", { name: "Removidas" }).click();
  await page.getByRole("button", { name: "Pesquisar" }).click();
  const row = page.getByRole("row").filter({ hasText: student.email });
  await expect(row.getByText("Removida")).toBeVisible();

  const studentPage = await (await browser.newContext()).newPage();
  await logIn(studentPage, student, "/minhas-turmas");
  await expect(studentPage.getByText("Você ainda não participa de nenhuma turma.")).toBeVisible();
});
