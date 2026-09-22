import { expect, test } from "@playwright/test";
import { logIn, newAccount, sessionRows, signUp, verifyEmail } from "./fixtures/journeys.ts";

test("002/US5-1 cadastro → e-mail de verificação → verificar → login → /conta/sessoes", async ({ page }) => {
  const account = newAccount("cadastro");

  await signUp(page, account);
  await verifyEmail(page, account);
  await logIn(page, account);

  await expect(page.getByRole("heading", { level: 1, name: "Minhas sessões" })).toBeVisible();
  await expect(sessionRows(page)).toHaveCount(1);
  await expect(sessionRows(page)).toContainText("(esta sessão)");
});
