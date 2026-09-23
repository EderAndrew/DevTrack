import { type Locator, type Page, expect, test } from "@playwright/test";
import { inviteToClass, newAccount, raFor } from "./fixtures/journeys.ts";
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

test("002/US5-2 003/US3-2 aceite do convite de turma, saída e login só com o teclado", async ({ page, browser }) => {
  const account = newAccount("teclado");
  await inviteToClass(browser, account);

  // The link arrives by e-mail: opening it is the address bar, not a click on the page.
  await page.goto(await waitForLink(account.email, { path: "/convite-turma" }));
  await typeInto(page, page.locator("#nome"), account.name);
  await typeInto(page, page.locator("#ra"), raFor(account));
  await typeInto(page, page.locator("#senha"), account.password);
  await typeInto(page, page.locator("#confirmar-senha"), account.password);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Você agora faz parte da turma." })).toBeVisible();

  // The acceptance signed the student in.
  await tabTo(page, page.getByRole("main").getByRole("link", { name: "Ir para o início" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/conta/perfil");
  await tabTo(page, page.getByRole("button", { name: "Sair", exact: true }));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/entrar");
  await typeInto(page, page.locator("#email"), account.email);
  await typeInto(page, page.locator("#senha"), account.password);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/conta/perfil");
  await expect(page.getByRole("heading", { level: 1, name: "Meu perfil" })).toBeVisible();
});
