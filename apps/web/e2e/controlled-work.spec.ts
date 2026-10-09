import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { bootstrapAdmin, field, logIn } from "./fixtures/journeys.ts";
import { apiPost, markAllPresentThroughApi, releaseToPresent, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** The orientation of the AI help's `open-poo-saldo-privado` case, replayed by e2e/openrouter-mock.ts. */
const GUIDANCE_START = "Comece imaginando o contrário: e se qualquer parte do sistema pudesse escrever direto no saldo?";
const PASTE_BLOCKED = "Colar não é permitido neste trabalho. Digite a sua resposta.";

/** "YYYY-MM-DDTHH:mm" of a `datetime-local` input, in the browser's (and this process's) time zone. */
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Presses Tab until `target` has the focus (keyboard only, 015/SC-009). */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

const answerBox = (page: Page) => page.getByLabel("Sua resposta");
const goToQuestion = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Questão ${n}\\b`) }).click();

/**
 * Leaving the tab, as the browser reports it (015/US2-3): headless Chromium never hides a page by
 * itself, so the page's `visibilityState` is flipped and `visibilitychange` dispatched, which is
 * exactly what the focus monitor listens to.
 */
async function leaveAndReturn(page: Page): Promise<void> {
  for (const state of ["hidden", "visible"] as const) {
    await page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  }
}

/**
 * `work-helper` is registered disabled (015 research F16): the ADMIN enables it in "Operação de IA"
 * after the release gate. Idempotent, since other runs or retries may have enabled it already.
 */
async function enableWorkHelper(page: Page): Promise<void> {
  await logIn(page, bootstrapAdmin(), "/admin/ia?aba=agentes");
  const agents = page.getByRole("region", { name: "Agentes" });
  await expect(agents.getByText("Ajuda da IA nos trabalhos")).toBeVisible();
  const enable = agents.getByRole("button", { name: "Habilitar o agente Ajuda da IA nos trabalhos" });
  if (await enable.isVisible()) {
    await enable.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Habilitar" }).click();
  }
  await expect(agents.getByRole("button", { name: "Desabilitar o agente Ajuda da IA nos trabalhos" })).toBeVisible();
  await page.context().clearCookies();
}

/** Answers the seed's 5 questions on the open answering screen (multiple choice by click, open answers typed). */
async function answerAll(page: Page): Promise<void> {
  await goToQuestion(page, 1);
  await page.getByRole("radio", { name: /extends/ }).check();
  await goToQuestion(page, 2);
  await answerBox(page).pressSequentially("Esconder o estado atrás de métodos públicos.");
  await goToQuestion(page, 3);
  await page.getByRole("radio", { name: /Uma instância de uma classe/ }).check();
  await goToQuestion(page, 4);
  await answerBox(page).pressSequentially("Muitas formas do mesmo método.");
  await goToQuestion(page, 5);
  await page.getByRole("radio", { name: /Sem modificador/ }).check();
}

/**
 * 015 — a work in the controlled mode with the AI help, on the real screens: the teacher turns both
 * options on; the student reads the notice, starts in the controlled mode, leaves the tab and sees
 * the warning with the server's time, has a paste blocked, asks for help by keyboard and gets the
 * orientation, and submits; the teacher sees the timeline and the help in the review (015/SC-004,
 * 015/SC-009). The AI answer comes from the local OpenRouter mock.
 */
test.describe("015 trabalho em modo controlado com ajuda da IA", () => {
  let seed: StudentPortalSeed;

  test.beforeAll(async ({ browser }) => {
    const adminPage = await (await browser.newContext()).newPage();
    await enableWorkHelper(adminPage);
    await adminPage.context().close();
    seed = await seedStudentPortal(browser);
  });

  test("015/US1-1 015/US2-3 015/US2-10 015/US3-2 015/US4-2 015/US5-2 015/SC-004 015/SC-009 professor liga as opções, aluno responde em modo controlado e pede ajuda, professor vê os registros", async ({ browser }) => {
    test.setTimeout(180_000);
    // The teacher applies the work with "Modo controlado" and "Ajuda da IA".
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, `/turmas/${seed.classId}/atividades/nova`);
    await teacherPage.getByRole("radio", { name: "Trabalho", exact: true }).check();
    await teacherPage.getByRole("radio", { name: new RegExp(seed.workTitle) }).check();
    await teacherPage.getByRole("button", { name: "Continuar" }).click();
    await expect(field(teacherPage, "Título")).toHaveValue(seed.workTitle);
    await field(teacherPage, "Prazo de entrega").fill(localInput(new Date(Date.now() + 7 * 24 * 3_600_000)));
    const options = teacherPage.getByRole("group", { name: "Como os alunos respondem" });
    await options.getByRole("checkbox", { name: "Modo controlado" }).check();
    await options.getByRole("checkbox", { name: "Ajuda da IA (3 perguntas por aluno)" }).check();
    await teacherPage.getByRole("button", { name: "Publicar atividade" }).click();
    await expect(teacherPage).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
    const activityPath = new URL(teacherPage.url()).pathname;
    const activityId = activityPath.split("/").at(-1)!;
    await expect(teacherPage.getByText("Modo controlado").first()).toBeVisible();
    // 016/US1: the work reaches only the students marked present.
    await releaseToPresent(teacherPage);

    // The student reads the notice and starts in the controlled mode: the focus page, no menu.
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);
    await expect(page.getByText("Este trabalho é feito em modo controlado")).toBeVisible();
    await page.getByRole("button", { name: "Iniciar em modo controlado" }).click();
    await expect(page).toHaveURL(new RegExp(`/minhas-atividades/${activityId}/responder$`));
    await expect(page.getByRole("navigation", { name: "Questões" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Minhas atividades" })).toHaveCount(0);

    // Leaving the tab and coming back: the warning with the server's time, nothing blocked.
    await leaveAndReturn(page);
    // A polite status (exam-mode.md): it never takes the focus from the answer.
    const warning = page.getByRole("status").filter({ hasText: "Você saiu da tela da avaliação" });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(/^Este evento foi registrado às \d{2}:\d{2}\.$/)).toBeVisible();

    // A paste in an answer is refused with the message, and recorded.
    await goToQuestion(page, 2);
    await answerBox(page).dispatchEvent("paste");
    await expect(page.getByText(PASTE_BLOCKED)).toBeVisible();
    await expect(answerBox(page)).toHaveValue("");

    // "Pedir ajuda" on question 2, by keyboard only: the dialog, the question, "Enviar", the orientation.
    const ask = page.getByRole("button", { name: "Pedir ajuda" });
    await tabTo(page, ask);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Pedir ajuda à IA" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Sua pergunta sobre esta questão")).toBeFocused();
    await page.keyboard.type("Não sei como começar essa resposta.");
    await tabTo(page, dialog.getByRole("button", { name: "Enviar" }));
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByText(GUIDANCE_START, { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Ajudas restantes: 2 de 3").first()).toBeVisible();

    // Every question answered, then submitted with confirmation by keyboard.
    await answerAll(page);
    const submit = page.getByRole("button", { name: "Entregar atividade" });
    await tabTo(page, submit);
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("alertdialog", { name: "Entregar atividade?" });
    await tabTo(page, confirm.getByRole("button", { name: "Entregar", exact: true }));
    await page.keyboard.press("Enter");
    await expect(page.getByText(/^Atividade entregue em /)).toBeVisible();
    // The delivery, opened from the history, shows the student's own exit and help (015/US5-1, US5-2).
    await page.goto("/historico");
    await page.getByRole("row").filter({ hasText: seed.workTitle }).getByRole("link", { name: seed.workTitle }).click();
    await expect(page.getByRole("heading", { name: "Saídas da tela registradas: 1" })).toBeVisible();
    await page.context().close();

    // The teacher sees the timeline and the help of question 2 in the review (015/SC-004).
    await teacherPage.goto(activityPath);
    await teacherPage.getByRole("link", { name: seed.student.name }).click();
    await expect(teacherPage.getByRole("heading", { name: `Tentativa de ${seed.student.name}` })).toBeVisible();
    const records = teacherPage.getByRole("region", { name: "Registros do modo controlado" });
    const timeline = records.getByRole("table", { name: "Eventos da tentativa, no horário do servidor." });
    await expect(timeline.getByText("Saiu da tela")).toBeVisible();
    await expect(timeline.getByText("Voltou à tela")).toBeVisible();
    await expect(timeline.getByText("Colar bloqueado · questão 2")).toBeVisible();
    const help = teacherPage.getByRole("region", { name: "Ajuda da IA na questão 2" });
    await expect(help.getByText("Pergunta do aluno: Não sei como começar essa resposta.")).toBeVisible();
    await expect(help.getByText(GUIDANCE_START, { exact: false })).toBeVisible();
    await expect(help.getByText("Entregue")).toBeVisible();
    await teacherPage.context().close();
  });

  test("015/SC-009 no celular: o aluno inicia, pede uma ajuda e entrega", async ({ browser }) => {
    test.setTimeout(120_000);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
      idempotencyKey: crypto.randomUUID(),
      source: { type: "ASSIGNMENT", workId: seed.workId },
      title: `${seed.workTitle} (celular)`,
      publishAt: null,
      deadline: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
      latePolicy: "REJECT",
      acknowledgeOutOfScope: false,
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
    });
    await markAllPresentThroughApi(teacherPage, seed.classId, activity.id);
    await teacherPage.context().close();

    const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activity.id}`);
    await page.getByRole("button", { name: "Iniciar em modo controlado" }).click();
    await expect(page).toHaveURL(new RegExp(`/minhas-atividades/${activity.id}/responder$`));
    await goToQuestion(page, 2);
    await page.getByRole("button", { name: "Pedir ajuda" }).click();
    const dialog = page.getByRole("dialog", { name: "Pedir ajuda à IA" });
    await dialog.getByLabel("Sua pergunta sobre esta questão").fill("Não sei como começar essa resposta.");
    await dialog.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(GUIDANCE_START, { exact: false })).toBeVisible({ timeout: 30_000 });
    await answerAll(page);
    await page.getByRole("button", { name: "Entregar atividade" }).click();
    await page.getByRole("alertdialog", { name: "Entregar atividade?" }).getByRole("button", { name: "Entregar", exact: true }).click();
    await expect(page.getByText(/^Atividade entregue em /)).toBeVisible();
    // The page never scrolls sideways on the phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.context().close();
  });
});
