import { type Page, expect } from "@playwright/test";
import { uniqueEmail } from "./emails.ts";
import { waitForLink } from "./mailpit.ts";

/** Example passwords only (12–128 characters, not in the common-password list). */
export const PASSWORD = "Trilha-E2E-cadastro-2026";
export const ADMIN_PASSWORD = "Trilha-E2E-administrador-2026";

export interface Account {
  name: string;
  email: string;
  password: string;
}

/** A fresh account for `journey`, not created yet. */
export function newAccount(journey: string, name = `Pessoa ${journey}`): Account {
  return { name, email: uniqueEmail(journey), password: PASSWORD };
}

/** Labels end with " (obrigatório)"; anchoring keeps "Nova senha" apart from "Confirme a nova senha". */
export const field = (page: Page, label: string) => page.getByLabel(new RegExp(`^${label}`));

export async function signUp(page: Page, account: Account): Promise<void> {
  await page.goto("/cadastro");
  await field(page, "Nome").fill(account.name);
  await field(page, "E-mail").fill(account.email);
  await field(page, "Senha").fill(account.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Verifique seu e-mail" })).toBeVisible();
}

/** Opens the verification link of the e-mail, as the user would. */
export async function verifyEmail(page: Page, account: Account): Promise<void> {
  await page.goto(await waitForLink(account.email, { path: "/verificar-email" }));
  await expect(page.getByRole("heading", { name: "E-mail verificado" })).toBeVisible();
}

/** Signs in through the login page and waits for `next` (default: the page's own fallback). */
export async function logIn(page: Page, account: Pick<Account, "email" | "password">, next = "/conta/sessoes"): Promise<void> {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await field(page, "E-mail").fill(account.email);
  await field(page, "Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(next);
}

/** Student account with a verified e-mail (signup → e-mail → link). */
export async function createVerifiedStudent(page: Page, journey: string, name?: string): Promise<Account> {
  const account = newAccount(journey, name);
  await signUp(page, account);
  await verifyEmail(page, account);
  return account;
}

/** Sends an invitation from the page of `path` ("/admin/managers" or "/professores"), signed in with permission. */
export async function invite(page: Page, path: string, invitee: Pick<Account, "name" | "email">): Promise<void> {
  await page.goto(path);
  await field(page, "Nome").fill(invitee.name);
  await field(page, "E-mail").fill(invitee.email);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByRole("cell").filter({ hasText: invitee.email }).first()).toBeVisible();
}

/** Accepts an invitation for a new account: link from the e-mail → password → accepted. */
export async function acceptInvitationWithPassword(page: Page, invitee: Account): Promise<void> {
  await page.goto(await waitForLink(invitee.email, { path: "/convite" }));
  await field(page, "Nova senha").fill(invitee.password);
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByRole("heading", { name: "Convite aceito" })).toBeVisible();
}

/** Rows of the "Minhas sessões" table (the header row has no button). */
export const sessionRows = (page: Page) =>
  page.getByRole("row").filter({ has: page.getByRole("button", { name: /^Encerrar sessão/ }) });

/** ADMIN of the run: bootstrap started by global-setup.ts, activated by admin-manager.spec.ts. */
export function bootstrapAdmin(): { email: string; link: string; password: string } {
  const { E2E_ADMIN_EMAIL: email, E2E_ADMIN_LINK: link } = process.env;
  if (!email || !link) throw new Error("global-setup.ts não registrou o bootstrap do ADMIN.");
  return { email, link, password: ADMIN_PASSWORD };
}
