import { expect, test, type Page } from "@playwright/test";
import { createEnrolledStudent, logIn, logOut } from "./fixtures/journeys.ts";

// 022 quickstart: the theme is the account's, rendered by the root layout from `GET /me`.

const theme = (page: Page) => page.locator("html");

/** The first HTML the server sends for `path`, before any script runs (no dark frame, SC-003). */
async function serverTheme(page: Page, path: string): Promise<string | undefined> {
  const html = await (await page.request.get(path)).text();
  return /<html[^>]*\sdata-theme="([a-z]+)"/.exec(html)?.[1];
}

test("022/US1-2 022/SC-003 022/SC-004 022/SC-007 022/US2-3 o tema claro segue a conta e só ela", async ({
  page,
  browser,
}) => {
  const a = await createEnrolledStudent(page, "tema-a", "Pessoa A do Tema");
  const b = await createEnrolledStudent(page, "tema-b", "Pessoa B do Tema");

  // US1-2: turning "Tema claro" on in "Meu perfil" switches at once, without a navigation.
  await logIn(page, a);
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  const url = page.url();
  // The switch sits in the page header, beside the title (PageHeader actions).
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1, name: "Meu perfil" }) });
  const toggle = header.getByRole("switch", { name: "Tema claro" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(theme(page)).toHaveAttribute("data-theme", "light");
  expect(page.url()).toBe(url);

  // SC-003: after a reload the server's HTML already says light.
  await page.reload();
  await expect(theme(page)).toHaveAttribute("data-theme", "light");
  expect(await serverTheme(page, "/conta/perfil")).toBe("light");

  // SC-004: another browser, same account → the first screen after the login is light.
  const elsewhere = await (await browser.newContext()).newPage();
  await expect.poll(() => serverTheme(elsewhere, "/entrar")).toBe("dark");
  await logIn(elsewhere, a);
  await expect(theme(elsewhere)).toHaveAttribute("data-theme", "light");
  await elsewhere.context().close();

  // SC-007: leaving → the login page is dark, also in the server's HTML.
  await logOut(page);
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  expect(await serverTheme(page, "/entrar")).toBe("dark");

  // US2-3: another account in the same browser sees its own theme, never the previous one's.
  await logIn(page, b);
  await expect(theme(page)).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("switch", { name: "Tema claro" })).not.toBeChecked();
});
