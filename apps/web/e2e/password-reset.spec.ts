import { expect, test } from "@playwright/test";
import { createVerifiedStudent, field, logIn } from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";

test("002/US5-1 esqueci a senha → e-mail → redefinir → login com a nova senha; link reaberto é recusado", async ({ page }) => {
  const account = await createVerifiedStudent(page, "senha");
  const newPassword = "Trilha-E2E-nova-senha-2026";

  await page.goto("/esqueci-senha");
  await field(page, "E-mail").fill(account.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible();

  const link = await waitForLink(account.email, { path: "/redefinir-senha" });
  await page.goto(link);
  await field(page, "Nova senha").fill(newPassword);
  await field(page, "Confirme a nova senha").fill(newPassword);
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByRole("heading", { name: "Senha redefinida" })).toBeVisible();

  await page.goto("/entrar");
  await field(page, "E-mail").fill(account.email);
  await field(page, "Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Não foi possível entrar" })).toBeVisible();

  await logIn(page, { email: account.email, password: newPassword });
  await expect(page.getByRole("heading", { level: 1, name: "Meu perfil" })).toBeVisible();

  // The link is single-use.
  await page.goto(link);
  await field(page, "Nova senha").fill("Trilha-E2E-outra-senha-2026");
  await field(page, "Confirme a nova senha").fill("Trilha-E2E-outra-senha-2026");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await expect(page.getByRole("heading", { name: "Não foi possível usar este link" })).toBeVisible();
});
