import { expect, test } from "@playwright/test";
import { adminPage, createCohortThroughForm, field } from "./fixtures/journeys.ts";
import { uniqueEmail } from "./fixtures/emails.ts";

// 003 SC-010, journey 1 (since 027 the turma's manager's): the ADMIN (MANAGER function) creates a turma, invites a
// student by e-mail only and sees the pending invitation in the "Convites" tab.
test("003/SC-010 003/US2-1 027/US2-1 gestor cria turma, convida aluno e vê o convite pendente", async ({ browser }) => {
  const page = await adminPage(browser);
  const cohortId = await createCohortThroughForm(page, "Turma Convites E2E");
  await expect(page).toHaveURL(`/gestao/turmas/${cohortId}`);

  const email = uniqueEmail("aluno-pendente");
  await page.getByRole("button", { name: "Adicionar aluno" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar aluno" });
  await field(dialog, "E-mail").fill(email);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();

  await page.getByRole("tablist", { name: "Seções da turma" }).getByRole("tab", { name: "Convites" }).click();
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pendente", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `Reenviar convite para ${email}` })).toBeVisible();
  await page.context().close();
});
