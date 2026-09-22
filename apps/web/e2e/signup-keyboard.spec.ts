import { type Locator, type Page, expect, test } from "@playwright/test";
import { newAccount } from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";

/** Presses Tab until `target` has the focus (reading the focus is only an observation). */
async function tabTo(page: Page, target: Locator, maxPresses = 30): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Foco não chegou ao alvo em ${maxPresses} Tabs.`);
}

async function typeInto(page: Page, target: Locator, text: string): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.type(text);
}

test("002/US5-2 cadastro, verificação e login só com o teclado", async ({ page }) => {
  const account = newAccount("teclado");

  await page.goto("/cadastro");
  await typeInto(page, page.locator("#nome"), account.name);
  await typeInto(page, page.locator("#email"), account.email);
  await typeInto(page, page.locator("#senha"), account.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible();

  // The link arrives by e-mail: opening it is the address bar, not a click on the page.
  await page.goto(await waitForLink(account.email, { path: "/verificar-email" }));
  await expect(page.getByRole("heading", { name: "E-mail verificado" })).toBeVisible();
  await tabTo(page, page.getByRole("main").getByRole("link", { name: "Entrar" }));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/entrar");
  await typeInto(page, page.locator("#email"), account.email);
  await typeInto(page, page.locator("#senha"), account.password);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/conta/perfil");
  await expect(page.getByRole("heading", { level: 1, name: "Meu perfil" })).toBeVisible();
});
