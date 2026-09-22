import { expect, test } from "@playwright/test";
import { acceptInvitationWithPassword, bootstrapAdmin, field, invite, logIn, newAccount } from "./fixtures/journeys.ts";

test("002/US5-1 bootstrap do ADMIN → ativação → convite de MANAGER → aceite → MANAGER entra", async ({ browser }) => {
  const admin = bootstrapAdmin();
  const manager = newAccount("gestor", "Gestora E2E");

  const adminPage = await (await browser.newContext()).newPage();
  await adminPage.goto(admin.link);
  await expect(adminPage.getByRole("form", { name: "Definir senha" })).toContainText(admin.email);
  await field(adminPage, "Nova senha").fill(admin.password);
  await adminPage.getByRole("button", { name: "Ativar administrador" }).click();
  await expect(adminPage.getByRole("heading", { name: "Conta de administrador ativada" })).toBeVisible();

  await logIn(adminPage, admin, "/admin/managers");
  await invite(adminPage, "/admin/managers", manager);

  const managerPage = await (await browser.newContext()).newPage();
  await acceptInvitationWithPassword(managerPage, manager);
  await logIn(managerPage, manager);
  await managerPage.getByRole("navigation", { name: "Conta" }).getByRole("link", { name: "Professores" }).click();
  await expect(managerPage.getByRole("heading", { level: 1, name: "Professores" })).toBeVisible();

  await adminPage.reload();
  const managers = adminPage.getByRole("table", { name: "Gestores de cadastros" });
  await expect(managers.getByRole("row").filter({ hasText: manager.email })).toContainText("Ativo");
});
