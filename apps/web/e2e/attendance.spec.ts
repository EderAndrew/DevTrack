import { type Browser, devices, expect, type Locator, type Page, test } from "@playwright/test";
import { WEB_URL } from "./env.ts";
import { unique } from "./fixtures/curriculum.ts";
import { type Account, acceptClassInvitation, logIn, newAccount, raFor } from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";
import { apiPost, markAllPresentThroughApi, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** SC-002 and SC-004: what one side does shows on the other within 10 s, through the 5 s polling, never a reload. */
const WITHIN_10_S = { timeout: 10_000 };
const DAY_MS = 24 * 3_600_000;

/** Presses Tab until `target` has the focus (keyboard only, 016/SC-010). */
async function tabTo(page: Page, target: Locator, max = 200): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/** Tab to `target` and press Enter. */
async function press(page: Page, target: Locator): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

/** The teacher applies the seed's work to `classId` through the API (a new work: it waits for the attendance); returns its id. */
async function applyWork(page: Page, seed: StudentPortalSeed, classId: string, title: string): Promise<string> {
  const activity = await apiPost<{ id: string; releaseMode: string }>(page, `/classes/${classId}/activities`, {
    idempotencyKey: crypto.randomUUID(),
    source: { type: "ASSIGNMENT", workId: seed.workId },
    title,
    publishAt: null,
    deadline: new Date(Date.now() + 7 * DAY_MS).toISOString(),
    latePolicy: "REJECT",
    acknowledgeOutOfScope: false,
  });
  expect(activity.releaseMode).toBe("PRESENT_ONLY");
  return activity.id;
}

/**
 * Students of `classId` created through the class invitations (003 FR-048), all through the API:
 * the teacher invites, each student accepts with the e-mail's token in a context of its own.
 */
async function enrollStudents(browser: Browser, teacherPage: Page, classId: string, accounts: Account[]): Promise<void> {
  for (const account of accounts) await apiPost(teacherPage, `/classes/${classId}/invitations`, { email: account.email });
  const context = await browser.newContext();
  for (let i = 0; i < accounts.length; i += 10) {
    await Promise.all(
      accounts.slice(i, i + 10).map(async (account) => {
        const token = new URL(await waitForLink(account.email, { path: "/convite-turma", timeoutMs: 60_000 })).searchParams.get("token")!;
        const res = await context.request.post("/api/class-invitations/accept", {
          data: { token, name: account.name, ra: raFor(account), password: account.password },
          headers: { Origin: WEB_URL },
        });
        expect(res.status(), `${account.email}: ${await res.text()}`).toBeLessThan(300);
      }),
    );
  }
  await context.close();
}

/**
 * 016 — attendance-gated release on the real screens, the teacher and two students in separate
 * contexts: the applied work is invisible until the attendance; the attendance releases it to the
 * one marked; that student starts, leaves the room, and the teacher's panel shows the exit; the
 * teacher releases the return and the student resumes with the answer intact; the late student is
 * marked and sees the work. Everything by keyboard, on desktop and on a phone (016/SC-010). The
 * attendance of a class of 40 takes under a minute (016/SC-005).
 */
test.describe("016 chamada e liberação do trabalho aos presentes", () => {
  let seed: StudentPortalSeed;
  let late: Account;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    seed = await seedStudentPortal(browser);
    // A second student of the class: the late one.
    late = newAccount("chamada-atrasado", `Aluno Atrasado ${unique()}`);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await apiPost(teacherPage, `/classes/${seed.classId}/invitations`, { email: late.email });
    await teacherPage.context().close();
    const latePage = await (await browser.newContext()).newPage();
    await acceptClassInvitation(latePage, late);
    await latePage.context().close();
  });

  test("016/SC-002 016/SC-004 016/SC-010 chamada, saída da sala, retorno e atrasado, só com o teclado", async ({ browser }) => {
    test.setTimeout(240_000);
    const title = `Trabalho com chamada ${unique()}`;
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const activityId = await applyWork(teacherPage, seed, seed.classId, title);
    await teacherPage.goto(`/turmas/${seed.classId}/atividades/${activityId}?aba=alunos`);
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });
    await expect(attendance.getByText("Aguardando chamada")).toBeVisible();

    // 1. Applied, but no student sees it before the attendance.
    const studentPage = await (await browser.newContext()).newPage();
    await logIn(studentPage, seed.student, "/painel");
    const latePage = await (await browser.newContext()).newPage();
    await logIn(latePage, late, "/painel");
    await expect(studentPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(studentPage.getByRole("article", { name: title })).toHaveCount(0);
    await expect(latePage.getByRole("article", { name: title })).toHaveCount(0);

    // 2. The teacher marks the student by keyboard and releases: the work appears on the student's
    // dashboard without a reload (016/SC-002); the late student still sees nothing.
    await tabTo(teacherPage, attendance.getByRole("checkbox", { name: seed.student.name }));
    await teacherPage.keyboard.press("Space");
    await expect(attendance.getByText("1 de 2 selecionados")).toBeVisible();
    await press(teacherPage, attendance.getByRole("button", { name: "Liberar para os presentes" }));
    const confirm = teacherPage.getByRole("alertdialog", { name: "Liberar o trabalho para 1 aluno?" });
    await tabTo(teacherPage, confirm.getByRole("button", { name: "Liberar", exact: true }), 5);
    await teacherPage.keyboard.press("Enter");
    await expect(attendance.getByText("1 de 2 presentes")).toBeVisible();
    const card = studentPage.getByRole("article", { name: title });
    await expect(card).toBeVisible(WITHIN_10_S);
    await expect(latePage.getByRole("article", { name: title })).toHaveCount(0);

    // 3. The student starts by keyboard, answers question 1 and leaves the room ("Beber água"); the
    // teacher's panel shows the exit without a reload (016/SC-004).
    await press(studentPage, card.getByRole("link", { name: "Iniciar" }));
    await press(studentPage, studentPage.getByRole("button", { name: "Iniciar atividade" }));
    await expect(studentPage.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    const extends_ = studentPage.getByRole("radio", { name: /extends/ });
    await tabTo(studentPage, studentPage.getByRole("radio").first());
    await studentPage.keyboard.press("Space");
    await expect(extends_).toBeChecked();
    await press(studentPage, studentPage.getByRole("button", { name: "Sair da sala" }));
    const exit = studentPage.getByRole("dialog", { name: "Sair da sala" });
    await tabTo(studentPage, exit.getByRole("radio", { name: "Ir ao banheiro" }), 20);
    await studentPage.keyboard.press("ArrowDown");
    await expect(exit.getByRole("radio", { name: "Beber água" })).toBeChecked();
    await press(studentPage, exit.getByRole("button", { name: "Confirmar saída" }));
    await expect(studentPage.getByText("Atividade pausada")).toBeVisible();
    await expect(studentPage.getByRole("heading", { name: /^Questão 1/ })).toHaveCount(0);
    const studentRow = attendance.getByRole("listitem").filter({ hasText: seed.student.name });
    await expect(studentRow.getByText(/^Fora da sala — Beber água, desde \d{2}:\d{2}$/)).toBeVisible(WITHIN_10_S);

    // 4. One action releases the return; the student resumes by keyboard with the answer intact.
    await press(teacherPage, attendance.getByRole("button", { name: `Liberar retorno ${seed.student.name}` }));
    await expect(studentRow.getByText("Respondendo")).toBeVisible();
    await expect(studentPage.getByText("Retorno liberado")).toBeVisible(WITHIN_10_S);
    await press(studentPage, studentPage.getByRole("button", { name: "Retomar", exact: true }));
    await expect(studentPage.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    await expect(extends_).toBeChecked();

    // 5. The late student is marked by keyboard and sees the work without a reload.
    await press(teacherPage, attendance.getByRole("button", { name: `Marcar presente ${late.name}` }));
    await expect(attendance.getByText("2 de 2 presentes")).toBeVisible();
    await expect(latePage.getByRole("article", { name: title })).toBeVisible(WITHIN_10_S);

    for (const page of [teacherPage, studentPage, latePage]) await page.context().close();
  });

  test("016/SC-010 no celular: o aluno sai da sala e retoma só com o teclado, sem rolagem horizontal", async ({ browser }) => {
    test.setTimeout(120_000);
    const title = `Trabalho com chamada no celular ${unique()}`;
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const activityId = await applyWork(teacherPage, seed, seed.classId, title);
    await markAllPresentThroughApi(teacherPage, seed.classId, activityId);
    await teacherPage.goto(`/turmas/${seed.classId}/atividades/${activityId}?aba=alunos`);
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });

    const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
    const fitsTheScreen = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    await logIn(page, late, `/minhas-atividades/${activityId}`);
    await press(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await expect(page.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    await press(page, page.getByRole("button", { name: "Sair da sala" }));
    const exit = page.getByRole("dialog", { name: "Sair da sala" });
    await tabTo(page, exit.getByRole("radio", { name: "Ir ao banheiro" }), 20);
    await page.keyboard.press("Space");
    await press(page, exit.getByRole("button", { name: "Confirmar saída" }));
    await expect(page.getByText("Atividade pausada")).toBeVisible();
    expect(await fitsTheScreen()).toBe(true);

    const row = attendance.getByRole("listitem").filter({ hasText: late.name });
    await expect(row.getByText(/^Fora da sala — Ir ao banheiro, desde \d{2}:\d{2}$/)).toBeVisible(WITHIN_10_S);
    await press(teacherPage, attendance.getByRole("button", { name: `Liberar retorno ${late.name}` }));
    await expect(page.getByText("Retorno liberado")).toBeVisible(WITHIN_10_S);
    await press(page, page.getByRole("button", { name: "Retomar", exact: true }));
    await expect(page.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    expect(await fitsTheScreen()).toBe(true);
    for (const opened of [teacherPage, page]) await opened.context().close();
  });

  test("016/SC-005 numa turma de 40 alunos, \"Marcar todos\", desmarcar 3 e liberar leva menos de 1 minuto", async ({ browser }) => {
    test.setTimeout(300_000);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const suffix = unique();
    const big = await apiPost<{ id: string }>(teacherPage, "/classes", {
      name: `Turma de 40 ${suffix}`,
      code: `E2E-40-${suffix}`,
      academicYear: new Date().getFullYear(),
      subjectId: seed.subjectId,
    });
    const accounts = Array.from({ length: 40 }, (_, i) => newAccount(`chamada-40-${i}`, `Aluno ${String(i + 1).padStart(2, "0")} ${suffix}`));
    await enrollStudents(browser, teacherPage, big.id, accounts);
    const activityId = await applyWork(teacherPage, seed, big.id, `Trabalho da turma de 40 ${suffix}`);
    await teacherPage.goto(`/turmas/${big.id}/atividades/${activityId}?aba=alunos`);
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });
    await expect(attendance.getByText("Aguardando chamada")).toBeVisible();

    // The clock of the teacher's attendance: from "Marcar todos" to the room with 37 present.
    const started = Date.now();
    await attendance.getByRole("button", { name: "Marcar todos", exact: true }).click();
    await expect(attendance.getByText("40 de 40 selecionados")).toBeVisible();
    for (const account of accounts.slice(0, 3)) await attendance.getByRole("checkbox", { name: account.name }).uncheck();
    await expect(attendance.getByText("37 de 40 selecionados")).toBeVisible();
    await attendance.getByRole("button", { name: "Liberar para os presentes" }).click();
    await teacherPage.getByRole("alertdialog", { name: "Liberar o trabalho para 37 alunos?" }).getByRole("button", { name: "Liberar", exact: true }).click();
    await expect(attendance.getByText("37 de 40 presentes")).toBeVisible();
    expect(Date.now() - started).toBeLessThan(60_000);
    // The 3 left out are "Não marcado", with "Marcar presente" for when they arrive.
    for (const account of accounts.slice(0, 3)) {
      await expect(attendance.getByRole("button", { name: `Marcar presente ${account.name}` })).toBeVisible();
    }
    await teacherPage.context().close();
  });
});
