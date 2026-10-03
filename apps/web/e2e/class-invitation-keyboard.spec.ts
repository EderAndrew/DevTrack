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

  // The acceptance signed the student in and led to "Minhas turmas" (003/FR-038).
  await expect(page).toHaveURL("/minhas-turmas?bem-vindo=1");
  await expect(page.getByRole("heading", { level: 1, name: "Minhas turmas" })).toBeVisible();
  // The student layout: its own side menu with the student's items only, not the "Menu principal" (005/US5-1).
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toHaveCount(0);
  await tabTo(page, page.getByRole("navigation", { name: "Menu do aluno" }).getByRole("link", { name: "Meu perfil" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/conta/perfil");
  await tabTo(page, page.getByRole("button", { name: "Sair", exact: true }));
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/entrar");
  await typeInto(page, page.locator("#email"), account.email);
  await typeInto(page, page.locator("#senha"), account.password);
  await page.keyboard.press("Enter");

  // A student's start page is the "Painel" since 012 (research P23).
  await expect(page).toHaveURL("/painel");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
