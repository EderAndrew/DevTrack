import { expect, test } from "@playwright/test";
import { adminPage, createCohortThroughApi, createEnrolledStudent, logIn } from "./fixtures/journeys.ts";

// 003 SC-010, journey 4 (since 027 the turma's manager's, US5): the manager ends a student's enrollment; it leaves
// the turma's list of active students and the student still signs in, now without the turma in "Minhas turmas".
test("003/SC-010 003/US6-3 027/US5-1 gestor encerra a matrícula; matrícula encerrada; o aluno ainda entra no sistema", async ({ page, browser }) => {
  const cohortId = await createCohortThroughApi(browser, "Turma da Remoção E2E");
  const student = await createEnrolledStudent(page, "aluno-removido", "Aluno Removido E2E", cohortId);

  const manager = await adminPage(browser, `/gestao/turmas/${cohortId}`);
  await manager.getByRole("button", { name: `Encerrar matrícula de ${student.name}` }).click();
  const dialog = manager.getByRole("alertdialog", { name: `Encerrar a matrícula de ${student.name}?` });
  await dialog.getByRole("button", { name: "Encerrar matrícula" }).click();
  await expect(manager.getByText(`Matrícula de ${student.name} encerrada.`)).toBeVisible();
  await expect(manager.getByRole("row").filter({ hasText: student.email })).toHaveCount(0);
  await expect(manager.getByText("Nenhum aluno na turma ainda.")).toBeVisible();
  await manager.context().close();

  const studentPage = await (await browser.newContext()).newPage();
  await logIn(studentPage, student, "/minhas-turmas");
  await expect(studentPage.getByText("Você ainda não participa de nenhuma turma.")).toBeVisible();
});
