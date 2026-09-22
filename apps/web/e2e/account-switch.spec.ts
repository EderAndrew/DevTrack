import { expect, test } from "@playwright/test";
import { createVerifiedStudent, logIn, sessionRows } from "./fixtures/journeys.ts";

test("002/US5-3 002/SC-007 A vê suas sessões → sai → B entra no mesmo navegador → nenhum dado de A na tela", async ({
  page,
  browser,
}) => {
  const a = await createVerifiedStudent(page, "troca-a", "Pessoa A da Troca");
  const b = await createVerifiedStudent(page, "troca-b", "Pessoa B da Troca");

  // A second session of A elsewhere, so A's list differs from B's.
  await logIn(await (await browser.newContext()).newPage(), a);

  await logIn(page, a);
  await expect(sessionRows(page)).toHaveCount(2);

  await page.getByRole("navigation", { name: "Conta" }).getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL("/entrar");

  await logIn(page, b);
  await expect(sessionRows(page)).toHaveCount(1);
  await expect(sessionRows(page)).toContainText("(esta sessão)");
  const html = await page.content();
  expect(html).not.toContain(a.email);
  expect(html).not.toContain(a.name);
});
