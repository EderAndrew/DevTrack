import { expect, type Page, test } from "@playwright/test";
import { WEB_URL } from "./env.ts";
import { acceptClassInvitation, type Account, classTeacher, inviteToCohort, logIn, newAccount } from "./fixtures/journeys.ts";

/**
 * 030/SC-005 (G1) — the student's "Minhas turmas" on a 360 px phone, in the dark and light themes (the account's, 022):
 * the disciplina's card is shown and the page never scrolls sideways. axe and contrast run in the unit test
 * (`my-classes.test.tsx`); this one needs a real layout.
 */
async function setTheme(page: Page, theme: "DARK" | "LIGHT"): Promise<void> {
  const res = await page.request.patch("/api/me/preferences", { data: { theme }, headers: { Origin: WEB_URL } });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

test.describe("030 Minhas turmas redesenhada", () => {
  let student: Account;

  test.beforeAll(async ({ browser }) => {
    student = newAccount("aluno-minhas-turmas", "Aluna Minhas Turmas E2E");
    await inviteToCohort(browser, student);
    const page = await (await browser.newContext()).newPage();
    await acceptClassInvitation(page, student);
    await expect(page.getByRole("heading", { level: 1, name: "Minhas turmas" })).toBeVisible();
    await page.context().close();
  });

  for (const theme of ["DARK", "LIGHT"] as const) {
    test(`030/SC-005 Minhas turmas sem rolagem horizontal em 360 px, tema ${theme === "DARK" ? "escuro" : "claro"}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage();
      await logIn(page, student, "/painel");
      await setTheme(page, theme);
      await page.goto("/minhas-turmas");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "DARK" ? "dark" : "light");
      await page.setViewportSize({ width: 360, height: 800 });

      const card = page.getByRole("article", { name: classTeacher().subjectName, exact: true });
      await expect(card).toBeVisible();
      await expect(card.getByRole("link", { name: /^Acessar / })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await setTheme(page, "DARK");
      await context.close();
    });
  }
});
