import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Browser, type Locator, type Page, expect } from "@playwright/test";
import { WEB_DIR, WEB_URL } from "../env.ts";
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

/**
 * 032: the "Término" of a Trabalho or a Prova in "Nova atividade" (contracts/ui.md): its date and time in the browser's
 * time zone, `hours` ahead of now (default a week; the início stays "Agora").
 */
export async function fillPeriodEnd(scope: Page | Locator, hours = 7 * 24): Promise<void> {
  const end = new Date(Date.now() + hours * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  await field(scope, "Data do término").fill(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
  await field(scope, "Horário do término").fill(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
}

/** Signs in through the login page and waits for `next` (default: the page's own fallback). */
/** The account menu at the bottom of the side menu (name and e-mail); it holds "Meu perfil" and "Sair". */
export const accountMenu = (page: Page): Locator => page.locator('[data-sidebar="footer"]').getByRole("button").last();

/** Opens the account menu and chooses "Sair"; the user ends up on the login page. */
export async function logOut(page: Page): Promise<void> {
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL("/entrar");
}

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
  await field(page, "Confirmar senha").fill(invitee.password);
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

/**
 * Teacher, turma and disciplina da turma created by class-teacher-setup.spec.ts (project `teacher`), shared through a
 * file. Since 027 the turma (`cohortId`) is the ADMIN's (the MANAGER function) and the class is the teacher's subject in it.
 */
export interface ClassTeacher extends Account {
  classId: string;
  cohortId: string;
  cohortName: string;
  subjectName: string;
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
 * Writes through the E2E API (behind the web's same-origin `/api/*` rewrite, with the session of
 * `page`): unsafe methods need the allowed `Origin` and a JSON body (OriginGuard, R6).
 */
export async function apiPost<T>(page: Page, path: string, data: object): Promise<T> {
  const res = await page.request.post(`/api${path}`, { data, headers: { Origin: WEB_URL } });
  expect(res.status(), `${path}: ${await res.text()}`).toBeLessThan(300);
  return (await res.json()) as T;
}

/** A turma code unique in the run (027: unique per ano letivo). */
export const uniqueCohortCode = (prefix = "E2E") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

/** A page of the run's ADMIN (the MANAGER function: `turmas.*`, 027) in its own context; the caller closes it. */
export async function adminPage(browser: Browser, next = "/gestao/turmas"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await logIn(page, bootstrapAdmin(), next);
  return page;
}

/** Creates a turma (027) through the API, by the ADMIN of the run; returns its id. */
export async function createCohortThroughApi(browser: Browser, name: string): Promise<string> {
  const page = await adminPage(browser, "/conta/perfil");
  const cohort = await apiPost<{ id: string }>(page, "/cohorts", {
    name,
    code: uniqueCohortCode(),
    academicYear: new Date().getFullYear(),
  });
  await page.context().close();
  return cohort.id;
}

/** Invites each e-mail to the turma through the API, by the ADMIN of the run (027: invitations are the MANAGER's). */
export async function inviteThroughApi(browser: Browser, cohortId: string, emails: string[]): Promise<void> {
  const page = await adminPage(browser, "/conta/perfil");
  for (const email of emails) await apiPost(page, `/cohorts/${cohortId}/invitations`, { email });
  await page.context().close();
}

/**
 * Student account with a verified e-mail, the only way one exists since 003 (FR-048): the
 * turma's manager (the run's ADMIN, 027) invites the e-mail to the turma of the run (or `cohortId`)
 * and the student accepts through the link of the e-mail, creating the account. Both happen in
 * their own browser contexts, and the session opened by the acceptance is ended there, so the
 * caller's pages start signed out and with no extra session in "Minhas sessões".
 */
export async function createEnrolledStudent(page: Page, journey: string, name?: string, cohortId?: string): Promise<Account> {
  const browser = page.context().browser() as Browser;
  const account = newAccount(journey, name);
  await inviteToCohort(browser, account, cohortId);

  const studentPage = await (await browser.newContext()).newPage();
  await acceptClassInvitation(studentPage, account);
  await studentPage.goto("/conta/perfil");
  await logOut(studentPage);
  await studentPage.context().close();
  return account;
}

/**
 * The turma's manager (the run's ADMIN, 027) invites `account` — an e-mail with no student account — from the turma's
 * page ("Adicionar aluno" → "Continuar" → "Enviar convite"; the turma of the run by default), in its own context.
 */
export async function inviteToCohort(
  browser: Browser,
  account: Pick<Account, "email">,
  cohortId = classTeacher().cohortId,
): Promise<void> {
  const page = await adminPage(browser, `/gestao/turmas/${cohortId}`);
  await page.getByRole("button", { name: "Adicionar aluno" }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar aluno" });
  await field(dialog, "E-mail").fill(account.email);
  await dialog.getByRole("button", { name: "Continuar" }).click();
  await expect(dialog.getByText("Esse e-mail ainda não tem conta de aluno.")).toBeVisible();
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();
  await page.context().close();
}

/** Creates a turma through "Nova turma" of `/gestao/turmas` (the page must be a MANAGER's or ADMIN's); returns its id. */
export async function createCohortThroughForm(page: Page, name: string, code = uniqueCohortCode()): Promise<string> {
  await page.goto("/gestao/turmas");
  await page.getByRole("button", { name: "Nova turma" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova turma" });
  await field(dialog, "Nome").fill(name);
  await field(dialog, "Código").fill(code);
  await field(dialog, "Ano letivo").fill(String(new Date().getFullYear()));
  await dialog.getByRole("button", { name: "Criar turma" }).click();
  await expect(page.getByText("Turma criada.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Pesquisar por nome ou código" }).fill(code);
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/gestao\/turmas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/**
 * "Acrescentar disciplina a uma turma" (027, `/turmas/nova`; the page must be the teacher's): searches the turma by
 * `search`, picks `cohortName` and the own subject `subjectName`, optionally the calendar; returns the class id.
 */
export async function addClassThroughForm(
  page: Page,
  search: string,
  cohortName: string,
  subjectName: string,
  period?: { startsOn: string; endsOn: string },
): Promise<string> {
  await page.goto("/turmas/nova");
  await page.getByRole("searchbox", { name: "Turma (nome ou código)" }).fill(search);
  await page.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await page.getByRole("radio", { name: new RegExp(`^${escapeRegExp(cohortName)}\\b`) }).check();
  await page.getByLabel("Disciplina", { exact: true }).selectOption({ label: subjectName });
  if (period) {
    await field(page, "Data de início").fill(period.startsOn);
    await field(page, "Data de término").fill(period.endsOn);
  }
  await page.getByRole("button", { name: "Acrescentar disciplina" }).click();
  await expect(page.getByText("Disciplina acrescentada à turma.")).toBeVisible();
  await page.getByRole("link", { name: `Abrir ${subjectName} · ${cohortName}` }).click();
  await expect(page).toHaveURL(/\/turmas\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
