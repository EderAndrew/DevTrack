import { type Page, expect, test } from "@playwright/test";
import { createSubject, unique } from "./fixtures/curriculum.ts";
import {
  type Account,
  acceptClassInvitation,
  acceptInvitationWithPassword,
  addClassThroughForm,
  adminPage,
  createCohortThroughForm,
  createEnrolledStudent,
  field,
  invite,
  logIn,
  newAccount,
  uniqueCohortCode,
} from "./fixtures/journeys.ts";
import { waitForMessages } from "./fixtures/mailpit.ts";

/** A teacher of the run, invited by the ADMIN, with one active subject of their own. */
async function teacherWithSubject(page: Page, journey: string, name: string, subjectName: string): Promise<Account> {
  const browser = page.context().browser()!;
  const teacher = newAccount(journey, name);
  const admin = await adminPage(browser, "/professores");
  await invite(admin, "/professores", teacher);
  await admin.context().close();
  await acceptInvitationWithPassword(page, teacher);
  await logIn(page, teacher, "/disciplinas");
  await createSubject(page, subjectName);
  return teacher;
}

/** The labels of the "Matéria" card's options (026; since 027 only the effectively active disciplinas). */
async function subjectOptions(page: Page): Promise<string[]> {
  await page.goto("/painel");
  const select = page.getByLabel("Matéria", { exact: true });
  await expect(select).toBeVisible();
  return (await select.locator("option").allTextContents()).map((text) => text.trim()).sort();
}

/**
 * 027 — the turma of the manager on the real screens (quickstart steps 1–6), each actor in their own context: a
 * MANAGER creates a turma, invites a new student (Mailpit) and includes an existing one directly (notice e-mail, no
 * token); two teachers add their disciplinas (the first one timed, 027/SC-004); the student's "Matéria" card offers
 * both; the second teacher, whose calendar has already ended, closes theirs and the card offers only the first; the
 * manager closes the turma at the end of the year and the student still sees it, "Encerrada", under its year.
 * There is no clock of the E2E: the closed disciplina's calendar is set in the past instead.
 */
test.describe.serial("027 turmas do gestor", () => {
  const suffix = unique();
  const cohortName = `ADS 3NA ${suffix}`;
  const cohortCode = uniqueCohortCode("ADS");
  const subjectA = `Banco de Dados ${suffix}`;
  const subjectB = `Redes ${suffix}`;
  let cohortId: string;
  let manager: Account;
  let newStudent: Account;
  let teacherA: Account;
  let teacherB: Account;

  test("027/US1-1 027/US2-1 027/US2-4 027/US2-7 gestor cria a turma, convida um aluno novo e inclui um aluno existente", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    manager = newAccount("gestor-turmas", `Gestora das Turmas ${suffix}`);
    const admin = await adminPage(browser, "/admin/managers");
    await invite(admin, "/admin/managers", manager);
    await admin.context().close();
    await acceptInvitationWithPassword(page, manager);
    await logIn(page, manager, "/gestao/turmas");

    // US1-1: the MANAGER's "Turmas" creates the turma.
    cohortId = await createCohortThroughForm(page, cohortName, cohortCode);

    // US2-1 / US2-4: a new e-mail gets an invitation naming only the turma; accepting it creates the student.
    newStudent = newAccount("aluno-turma-gestor", `Aluna da Turma ${suffix}`);
    await page.getByRole("button", { name: "Adicionar aluno" }).click();
    let dialog = page.getByRole("dialog", { name: "Adicionar aluno" });
    await field(dialog, "E-mail").fill(newStudent.email);
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await expect(dialog.getByText("Esse e-mail ainda não tem conta de aluno.")).toBeVisible();
    await dialog.getByRole("button", { name: "Enviar convite" }).click();
    await expect(page.getByText("Convite enviado.")).toBeVisible();
    const studentPage = await (await browser.newContext()).newPage();
    await acceptClassInvitation(studentPage, newStudent);
    // 030: a turma with no disciplina yet is one card named by the turma.
    const cohortCard = studentPage.getByRole("article", { name: cohortName, exact: true });
    await expect(cohortCard).toBeVisible();
    await expect(cohortCard.getByText("Ainda não há disciplinas nesta turma.")).toBeVisible();
    await studentPage.context().close();

    // US2-7: an existing student is found by the exact e-mail and included at once, with a notice e-mail (no token).
    const existing = await createEnrolledStudent(page, "aluno-incluido", `Aluno Incluído ${suffix}`);
    await logIn(page, manager, `/gestao/turmas/${cohortId}`);
    await page.getByRole("button", { name: "Adicionar aluno" }).click();
    dialog = page.getByRole("dialog", { name: "Adicionar aluno" });
    await field(dialog, "E-mail").fill(existing.email);
    await dialog.getByRole("button", { name: "Continuar" }).click();
    await expect(dialog.getByText("· já tem conta")).toBeVisible();
    await expect(dialog.getByText(existing.name, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Incluir na turma" }).click();
    await expect(page.getByText("Aluno incluído na turma.")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: existing.email });
    await expect(row.getByText("Ativa", { exact: true })).toBeVisible();
    const [, notice] = await waitForMessages(existing.email, 2);
    expect(notice!.Text).toContain(cohortName);
    expect(notice!.Text).toContain("/entrar");
    expect(notice!.Text).not.toMatch(/token=/);
  });

  test("027/SC-004 027/US3-2 professor encontra a turma e acrescenta a sua disciplina em até 3 interações e menos de 1 minuto", async ({
    page,
  }) => {
    teacherA = await teacherWithSubject(page, "professor-a-turma", `Professora A ${suffix}`, subjectA);
    await page.goto("/disciplinas");

    // From the click on "Turmas" to "Disciplina acrescentada à turma.": the three interactions of SC-004 (search,
    // choose the turma, confirm the disciplina) after opening "Acrescentar disciplina".
    const started = Date.now();
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Turmas", exact: true }).click();
    await page.getByRole("link", { name: "Acrescentar disciplina" }).click();
    await expect(page).toHaveURL("/turmas/nova");
    let interactions = 0;
    const search = page.getByRole("searchbox", { name: "Turma (nome ou código)" });
    await search.fill(cohortCode.toLowerCase());
    await search.press("Enter");
    interactions += 1;
    await page.getByRole("radio", { name: new RegExp(`^${cohortName}`) }).check();
    interactions += 1;
    await page.getByLabel("Disciplina", { exact: true }).selectOption({ label: subjectA });
    await page.getByRole("button", { name: "Acrescentar disciplina" }).click();
    interactions += 1;
    await expect(page.getByText("Disciplina acrescentada à turma.")).toBeVisible();
    const elapsed = Date.now() - started;

    expect(interactions).toBeLessThanOrEqual(3);
    expect(elapsed).toBeLessThan(60_000);
    await page.getByRole("link", { name: `Abrir ${subjectA} · ${cohortName}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: `${subjectA} · ${cohortName}` })).toBeVisible();
  });

  test("027/US3-5 027/US2-5 027/US4-3 segundo professor acrescenta outra disciplina; o aluno vê as duas no card; encerrada após o calendário, sai do card", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    teacherB = await teacherWithSubject(page, "professor-b-turma", `Professor B ${suffix}`, subjectB);
    // A calendar already over: the close rule (FR-022) uses the server's today, after `endsOn`.
    const lastYear = new Date().getFullYear() - 1;
    const classB = await addClassThroughForm(page, cohortCode, cohortName, subjectB, {
      startsOn: `${lastYear}-02-01`,
      endsOn: `${lastYear}-06-30`,
    });

    const studentPage = await (await browser.newContext()).newPage();
    await logIn(studentPage, newStudent, "/painel");
    expect(await subjectOptions(studentPage)).toEqual([`${subjectA} · ${cohortName}`, `${subjectB} · ${cohortName}`].sort());

    // US4-3: after the calendar's last day the teacher closes their own disciplina da turma.
    await page.goto(`/turmas/${classB}`);
    await page.getByRole("button", { name: "Encerrar disciplina" }).click();
    await expect(page.getByText("Disciplina da turma encerrada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reativar" })).toBeVisible();

    expect(await subjectOptions(studentPage)).toEqual([`${subjectA} · ${cohortName}`]);
    await studentPage.goto("/minhas-turmas");
    // 030: one card per disciplina da turma.
    const cardA = studentPage.getByRole("article", { name: subjectA, exact: true });
    const cardB = studentPage.getByRole("article", { name: subjectB, exact: true });
    await expect(cardB.getByText("Encerrada", { exact: true })).toBeVisible();
    await expect(cardA.getByText(teacherA.name)).toBeVisible();
    await expect(cardB.getByText(teacherB.name)).toBeVisible();
    await studentPage.context().close();
  });

  test("027/US1-4 027/US8-3 gestor encerra a turma; o aluno ainda a vê no seu ano, encerrada", async ({ page, browser }) => {
    await logIn(page, manager, `/gestao/turmas/${cohortId}`);
    await page.getByRole("button", { name: "Encerrar", exact: true }).click();
    await expect(page.getByText("Turma encerrada.")).toBeAttached();
    await expect(page.getByRole("button", { name: "Reativar" })).toBeVisible();

    const studentPage = await (await browser.newContext()).newPage();
    await logIn(studentPage, newStudent, "/minhas-turmas");
    // 030: the card of the turma's disciplina says "Encerrada" and keeps "Acessar turma" for reading; its year is shown.
    const card = studentPage.getByRole("article", { name: subjectA, exact: true });
    await expect(card.getByText(cohortName, { exact: true })).toBeVisible();
    await expect(card.getByText(String(new Date().getFullYear()), { exact: true })).toBeVisible();
    await expect(card.getByText("Encerrada", { exact: true }).first()).toBeVisible();
    await expect(card.getByRole("link", { name: new RegExp(`^Acessar ${subjectA}`) })).toBeVisible();
    await studentPage.context().close();
  });
});
