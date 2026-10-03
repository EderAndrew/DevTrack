import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Browser, type Locator, type Page, expect } from "@playwright/test";
import { WEB_DIR } from "../env.ts";
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
export const field = (scope: Page | Locator, label: string) => scope.getByLabel(new RegExp(`^${label}`));

/** Signs in through the login page and waits for `next` (default: the page's own fallback). */
export async function logIn(page: Page, account: Pick<Account, "email" | "password">, next = "/conta/perfil"): Promise<void> {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await field(page, "E-mail").fill(account.email);
  await field(page, "Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(next);
}

/** Sends an invitation from the page of `path` ("/admin/managers" or "/professores"), signed in with permission. */
export async function invite(page: Page, path: string, invitee: Pick<Account, "name" | "email">): Promise<void> {
  await page.goto(path);
  await field(page, "Nome").fill(invitee.name);
  await field(page, "E-mail").fill(invitee.email);
  await page.getByRole("button", { name: "Enviar convite", exact: true }).click();
  await expect(page.getByRole("cell").filter({ hasText: invitee.email }).first()).toBeVisible();
}

/** Accepts an invitation for a new account: link from the e-mail → password → accepted. */
export async function acceptInvitationWithPassword(page: Page, invitee: Account): Promise<void> {
  await page.goto(await waitForLink(invitee.email, { path: "/convite" }));
  await field(page, "Nova senha").fill(invitee.password);
  await page.getByRole("button", { name: "Aceitar convite" }).click();
  await expect(page.getByRole("heading", { name: "Convite aceito" })).toBeVisible();
}

/** Rows of the "Minhas sessões" table on the profile page (the header row has no button). */
export const sessionRows = (page: Page) =>
  page.getByRole("row").filter({ has: page.getByRole("button", { name: /^Encerrar sessão/ }) });

/** ADMIN of the run: bootstrap started by global-setup.ts, activated by admin-manager.spec.ts. */
export function bootstrapAdmin(): { email: string; link: string; password: string } {
  const { E2E_ADMIN_EMAIL: email, E2E_ADMIN_LINK: link } = process.env;
  if (!email || !link) throw new Error("global-setup.ts não registrou o bootstrap do ADMIN.");
  return { email, link, password: ADMIN_PASSWORD };
}

/** Teacher and class created by class-teacher-setup.spec.ts (project `teacher`), shared through a file. */
export interface ClassTeacher extends Account {
  classId: string;
}

/** Under outputDir, which Playwright empties at the start of each run: never a stale teacher. */
const CLASS_TEACHER_FILE = join(WEB_DIR, "test-results", "e2e-class-teacher.json");

export function saveClassTeacher(teacher: ClassTeacher): void {
  mkdirSync(dirname(CLASS_TEACHER_FILE), { recursive: true });
  writeFileSync(CLASS_TEACHER_FILE, JSON.stringify(teacher));
}

export function classTeacher(): ClassTeacher {
  try {
    return JSON.parse(readFileSync(CLASS_TEACHER_FILE, "utf8")) as ClassTeacher;
  } catch {
    throw new Error("class-teacher-setup.spec.ts não registrou o professor da turma (projeto teacher).");
  }
}

/**
 * Student account with a verified e-mail, the only way one exists since 003 (FR-048): the
 * teacher of the run invites the e-mail to its class and the student accepts through the link
 * of the e-mail, creating the account. Both happen in their own browser contexts, and the
 * session opened by the acceptance is ended there, so the caller's pages start signed out and
 * with no extra session in "Minhas sessões".
 */
export async function createEnrolledStudent(page: Page, journey: string, name?: string): Promise<Account> {
  const browser = page.context().browser() as Browser;
  const account = newAccount(journey, name);
  await inviteToClass(browser, account);

  const studentPage = await (await browser.newContext()).newPage();
  await acceptClassInvitation(studentPage, account);
  await studentPage.goto("/conta/perfil");
  await studentPage.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(studentPage).toHaveURL("/entrar");
  await studentPage.context().close();
  return account;
}

/**
 * The teacher of the run invites `account` to one of its classes ("Convidar aluno"; the class of
 * the run by default), in its own context.
 */
export async function inviteToClass(
  browser: Browser,
  account: Pick<Account, "email">,
  classId = classTeacher().classId,
): Promise<void> {
  const teacher = classTeacher();
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, teacher, `/turmas/${classId}`);
  await teacherPage.getByRole("button", { name: "Convidar aluno" }).click();
  const dialog = teacherPage.getByRole("dialog", { name: "Convidar aluno" });
  await field(dialog, "E-mail").fill(account.email);
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
  await expect(teacherPage.getByText("Convite enviado.")).toBeVisible();
  await teacherPage.context().close();
}

/** Creates a class through "Nova turma" (the page must be signed in as a teacher); returns its id. */
export async function createClassThroughForm(page: Page, name: string): Promise<string> {
  await page.goto("/turmas/nova");
  await field(page, "Nome").fill(name);
  await field(page, "Código").fill(`E2E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  await page.getByRole("button", { name: "Criar turma" }).click();
  await expect(page).toHaveURL(/\/turmas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/** Opens the class invitation link of the e-mail and creates the account (name, RA, password). */
export async function acceptClassInvitation(page: Page, account: Account): Promise<void> {
  await page.goto(await waitForLink(account.email, { path: "/convite-turma" }));
  await field(page, "Nome completo").fill(account.name);
  await field(page, "RA").fill(raFor(account));
  await field(page, "Senha").fill(account.password);
  await field(page, "Confirmar senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar na turma" }).click();
  await expect(page).toHaveURL("/minhas-turmas?bem-vindo=1");
  await expect(page.getByRole("heading", { name: "Você agora faz parte da turma." })).toBeVisible();
}

/** A unique RA per account (the RA is unique across students). */
export const raFor = (account: Pick<Account, "email">) =>
  `RA-${account.email.split("@")[0]!.replace(/[^A-Za-z0-9]/g, "").slice(-16)}`;
