import { expect, test } from "@playwright/test";
import { createEnrolledStudent, logIn, sessionRows } from "./fixtures/journeys.ts";

test("002/US5-1 dois logins → revogar o outro → sair de todos → sessões recusadas", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  const account = await createEnrolledStudent(first, "sessoes");

  await logIn(first, account);
  await logIn(second, account);

  await first.reload();
  await expect(sessionRows(first)).toHaveCount(2);
  await sessionRows(first).filter({ hasNotText: "(esta sessão)" }).getByRole("button").click();
  await expect(sessionRows(first)).toHaveCount(1);
  await expect(sessionRows(first)).toContainText("(esta sessão)");

  // The revoked session is refused by the API: the page sends it back to the login.
  await second.goto("/conta/perfil");
  await expect(second).toHaveURL(/\/entrar\?next=/);

  await logIn(second, account);
  await first.reload();
  await expect(sessionRows(first)).toHaveCount(2);
  await first.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
  await expect(first).toHaveURL("/entrar");

  for (const page of [first, second]) {
    await page.goto("/conta/perfil");
    await expect(page).toHaveURL(/\/entrar\?next=/);
  }
});
