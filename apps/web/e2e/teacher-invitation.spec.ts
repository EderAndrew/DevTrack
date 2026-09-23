import { expect, test } from "@playwright/test";
import {
  acceptInvitationWithPassword,
  bootstrapAdmin,
  createEnrolledStudent,
  field,
  invite,
  logIn,
  newAccount,
} from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";

// Starts from the ADMIN activated by admin-manager.spec.ts (project dependency in playwright.config.ts).
test("002/US5-1 aluno matriculado por convite de turma → MANAGER convida → aceite com a sessão do aluno → mesma conta com STUDENT + TEACHER", async ({
  browser,
}) => {
  const admin = bootstrapAdmin();
  const manager = newAccount("gestor-professor", "Gestor E2E");

  const studentPage = await (await browser.newContext()).newPage();
  const student = await createEnrolledStudent(studentPage, "aluno-professor", "Aluna Futura Professora");
  await logIn(studentPage, student);

  const adminPage = await (await browser.newContext()).newPage();
  await logIn(adminPage, admin, "/admin/managers");
  await invite(adminPage, "/admin/managers", manager);

  const managerPage = await (await browser.newContext()).newPage();
  await acceptInvitationWithPassword(managerPage, manager);
  await logIn(managerPage, manager, "/professores");
  await invite(managerPage, "/professores", student);

  // The e-mail already has an account: the invitation is accepted in it, with the student's session.
  await studentPage.goto(await waitForLink(student.email, { path: "/convite" }));
  await expect(studentPage.getByText(`Você está conectado como ${student.email}`)).toBeVisible();
  await studentPage.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(studentPage.getByRole("heading", { name: "Convite aceito" })).toBeVisible();
  await expect(studentPage.getByText("Você agora tem o papel de Professor")).toBeVisible();

  // One identity with both roles (never a second account).
  await adminPage.goto("/admin/usuarios");
  await field(adminPage, "Buscar por nome ou e-mail").fill(student.email);
  await adminPage.getByRole("button", { name: "Buscar", exact: true }).click();
  const rows = adminPage.getByRole("row").filter({ hasText: student.email });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Aluno (Ativo)");
  await expect(rows).toContainText("Professor (Ativo)");
});
