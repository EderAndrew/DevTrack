import { expect, type Locator, type Page, test } from "@playwright/test";
import { field, logIn } from "./fixtures/journeys.ts";
import { applyWorkThroughApi, seedStudentPortal, type StudentPortalSeed, WORK_QUESTIONS } from "./support/student-portal-seed.ts";

const OFFLINE_ALERT =
  "Você está sem conexão. Suas respostas ficam guardadas neste navegador e serão enviadas quando a conexão voltar.";
const SUBMIT_CONFIRMATION =
  "Tem certeza de que deseja entregar esta atividade? Depois de entregue, não será possível alterar as respostas.";

/** "YYYY-MM-DDTHH:mm" of a `datetime-local` input, in the browser's (and this process's) time zone. */
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Signs in from the login page with no `next`: the app root picks the student's start page. */
async function logInToStartPage(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/entrar");
  await field(page, "E-mail").fill(account.email);
  await field(page, "Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

const answerBox = (page: Page) => page.getByLabel("Sua resposta");
/** The visible "Resposta salva" (the same text is also announced in an `sr-only` status). */
const savedStatus = (page: Page) => page.getByText("Resposta salva", { exact: true }).first();
const goToQuestion = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Questão ${n}\\b`) }).click();

/** Presses Tab until `target` has the focus (keyboard only, SC-009). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/**
 * 012 — the whole cycle on the real screens: the teacher applies a mixed work; the student lands on
 * the dashboard, starts, answers, reloads and logs out and back in and finds the answers, keeps
 * an answer through a simulated offline period (SC-005), submits with confirmation; the teacher
 * grades and releases; the student sees the grade in the history and never an answer key.
 */
test.describe("012 portal do aluno", () => {
  let seed: StudentPortalSeed;

  test.beforeAll(async ({ browser }) => {
    seed = await seedStudentPortal(browser);
  });

  test("012/US1-1 012/US3-1 012/US4-1 012/US5-4 012/US6-2 012/SC-005 ciclo professor → aluno → professor → aluno", async ({ browser }) => {
    test.setTimeout(180_000);
    // The teacher applies the work: Trabalho, the approved work, a deadline in a week, published now.
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, `/turmas/${seed.classId}/atividades/nova`);
    await teacherPage.getByRole("radio", { name: "Trabalho", exact: true }).check();
    await teacherPage.getByRole("radio", { name: new RegExp(seed.workTitle) }).check();
    await teacherPage.getByRole("button", { name: "Continuar" }).click();
    await expect(field(teacherPage, "Título")).toHaveValue(seed.workTitle);
    await field(teacherPage, "Prazo de entrega").fill(localInput(new Date(Date.now() + 7 * 24 * 3_600_000)));
    await teacherPage.getByRole("button", { name: "Publicar atividade" }).click();
    await expect(teacherPage).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
    const activityPath = new URL(teacherPage.url()).pathname;

    // The student lands on the dashboard and starts from the card.
    const context = await browser.newContext();
    const page = await context.newPage();
    await logInToStartPage(page, seed.student);
    await expect(page).toHaveURL("/painel");
    const card = page.getByRole("article", { name: seed.workTitle });
    await card.getByRole("link", { name: "Iniciar" }).click();
    await page.getByRole("button", { name: "Iniciar atividade" }).click();

    await page.getByRole("radio", { name: /extends/ }).check();
    await page.getByRole("button", { name: "Próxima" }).click();
    await answerBox(page).fill("Esconder o estado atrás de métodos públicos.");
    await expect(savedStatus(page)).toBeVisible();

    // Reload, then log out and back in: the answers come back from the server.
    await page.reload();
    await expect(page.getByRole("radio", { name: /extends/ })).toBeChecked();
    await goToQuestion(page, 2);
    await expect(answerBox(page)).toHaveValue("Esconder o estado atrás de métodos públicos.");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL("/entrar");
    await logInToStartPage(page, seed.student);
    await page.getByRole("article", { name: seed.workTitle }).getByRole("link", { name: "Continuar" }).click();
    await goToQuestion(page, 2);
    await expect(answerBox(page)).toHaveValue("Esconder o estado atrás de métodos públicos.");

    // Offline: the answer stays on screen and in the browser, then goes when the connection returns.
    await goToQuestion(page, 3);
    await page.getByRole("radio", { name: /Uma instância de uma classe/ }).check();
    await goToQuestion(page, 4);
    await context.setOffline(true);
    await answerBox(page).fill("Muitas formas do mesmo método.");
    await expect(page.getByText(OFFLINE_ALERT)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(OFFLINE_ALERT)).toBeHidden();
    await expect(savedStatus(page)).toBeVisible();
    await page.reload();
    await goToQuestion(page, 4);
    await expect(answerBox(page)).toHaveValue("Muitas formas do mesmo método.");

    await goToQuestion(page, 5);
    await page.getByRole("radio", { name: /Sem modificador/ }).check();
    await page.getByRole("button", { name: "Entregar atividade" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Entregar atividade?" });
    await expect(dialog.getByText(SUBMIT_CONFIRMATION)).toBeVisible();
    await expect(dialog.getByText("Todas as questões estão respondidas.")).toBeVisible();
    await dialog.getByRole("button", { name: "Entregar", exact: true }).click();
    await expect(page.getByText(/^Atividade entregue em /)).toBeVisible();
    await expect(page.getByRole("button", { name: "Entregar atividade" })).toHaveCount(0);

    // The teacher grades the two open answers and releases the result.
    await teacherPage.goto(activityPath);
    await teacherPage.getByRole("link", { name: seed.student.name }).click();
    await expect(teacherPage.getByRole("heading", { name: `Tentativa de ${seed.student.name}` })).toBeVisible();
    await expect(teacherPage.getByText("Corrigida automaticamente").first()).toBeVisible();
    await field(teacherPage, "Nota da questão 2").fill("0,20");
    await field(teacherPage, "Feedback da questão 2").fill("Muito bem explicado.");
    await field(teacherPage, "Nota da questão 4").fill("0,15");
    await field(teacherPage, "Feedback geral").fill("Bom trabalho.");
    await teacherPage.getByRole("button", { name: "Salvar correção" }).click();
    await expect(teacherPage.getByText("Correção salva.")).toBeVisible();
    await teacherPage.goto(activityPath);
    await teacherPage.getByRole("button", { name: "Liberar resultado" }).click();
    await teacherPage.getByRole("alertdialog").getByRole("button", { name: "Liberar resultado" }).click();
    await expect(teacherPage.getByText("Resultado liberado.")).toBeVisible();
    await teacherPage.context().close();

    // The student sees the grade in the history and the result on the activity, never the answer key.
    await page.goto("/historico");
    const row = page.getByRole("row").filter({ hasText: seed.workTitle });
    await expect(row.getByText("0,95 de 1,00")).toBeVisible();
    await expect(row.getByText("Com feedback")).toBeVisible();
    await row.getByRole("link", { name: seed.workTitle }).click();
    const result = page.getByRole("region", { name: "Resultado" });
    await expect(result.getByText("0,95 de 1,00")).toBeVisible();
    await expect(result.getByText("Bom trabalho.")).toBeVisible();
    await expect(result.getByText("Feedback: Muito bem explicado.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("GABARITO-E2E-012");
    await expect(page.locator("body")).not.toContainText("correta");
    await context.close();
  });

  test("012/SC-009 iniciar → responder → entregar as 5 questões só com teclado", async ({ browser }) => {
    test.setTimeout(120_000);
    const activityId = await applyWorkThroughApi(browser, seed);
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);

    await tabTo(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    for (const [index, question] of WORK_QUESTIONS.entries()) {
      if (question.type === "MULTIPLE_CHOICE") {
        const choice = page.getByRole("radio", { name: new RegExp(question.correct) });
        await tabTo(page, page.getByRole("radio").first());
        // Arrows move the choice inside the group; the correct alternative is the first.
        await page.keyboard.press("Space");
        await expect(choice).toBeChecked();
      } else {
        await tabTo(page, answerBox(page));
        await page.keyboard.type("Resposta escrita só com o teclado.");
      }
      if (index < WORK_QUESTIONS.length - 1) {
        await tabTo(page, page.getByRole("button", { name: "Próxima" }));
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: new RegExp(`^Questão ${index + 2}`) })).toBeFocused();
      }
    }
    await tabTo(page, page.getByRole("button", { name: "Entregar atividade" }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Entregar atividade?" });
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("button", { name: "Entregar", exact: true }), 5);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Atividade entregue em /)).toBeVisible();
    await page.context().close();
  });

  test("012/FR-034 largura de celular: painel, atividade e histórico sem rolagem horizontal, menu em painel navegável por Tab", async ({ browser }) => {
    test.setTimeout(120_000);
    const activityId = await applyWorkThroughApi(browser, seed);
    const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await logIn(page, seed.student, "/painel");
    const fitsTheScreen = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    for (const path of ["/painel", `/minhas-atividades/${activityId}`, "/historico"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await fitsTheScreen(), path).toBe(true);
      // On a phone the side menu opens as a panel from the Topbar's button, by keyboard too.
      await tabTo(page, page.getByRole("button", { name: "Abrir ou fechar o menu" }));
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", { name: "Menu" });
      await tabTo(page, panel.getByRole("navigation", { name: "Menu do aluno" }).getByRole("link", { name: "Histórico" }));
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
    await page.goto(`/minhas-atividades/${activityId}`);
    await tabTo(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    expect(await fitsTheScreen(), "tela de responder").toBe(true);
    await context.close();
  });
});
