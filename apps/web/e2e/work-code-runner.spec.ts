import { expect, type Locator, type Page, test } from "@playwright/test";
import { unique } from "./fixtures/curriculum.ts";
import { field, logIn } from "./fixtures/journeys.ts";
import { apiPost, releaseToPresent, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** The private case: its input and expected output must appear nowhere on the student's page. */
const PRIVATE_INPUT = "4242";
const PRIVATE_OUTPUT = "8484";
const WITHIN_10_S = { timeout: 10_000 };

const editor = (page: Page) => page.getByRole("textbox", { name: /^Sua resposta/ });
const runButton = (page: Page) => page.getByRole("button", { name: "Executar", exact: true });
const result = (page: Page) => page.getByRole("region", { name: "Resultado da execução" });
const isFocused = (target: Locator) => target.evaluate((element) => element === document.activeElement);

/** "YYYY-MM-DDTHH:mm" of a `datetime-local` input, in the browser's (and this process's) time zone. */
function localInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Presses Tab until `target` has the focus, leaving the code editor with Esc first (014/FR-010). */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await isFocused(target)) return;
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="code-editor"]')))) await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

const press = async (page: Page, target: Locator) => {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
};

/** Replaces the editor's code by keyboard only (the editor never alters typed text, 014). */
async function writeCode(page: Page, code: string): Promise<void> {
  const target = editor(page);
  await expect(target).toHaveClass(/cm-content/);
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(code);
}

/** The teacher's work: one Python CODE question (2 public cases, 1 private) and one multiple choice, APPROVED. */
async function createCodeWork(page: Page, seed: StudentPortalSeed, title: string): Promise<string> {
  const languages = (await (await page.request.get("/api/programming-languages")).json()) as { id: string; key: string }[];
  const work = await apiPost<{ id: string }>(page, "/works", {
    subjectId: seed.subjectId,
    title,
    totalGrade: "1.00",
    topics: null,
    status: "APPROVED",
    questions: [
      {
        type: "CODE",
        statement: "Leia um inteiro e imprima o dobro.",
        topicItemIds: [],
        instructions: "Leia da entrada padrão e escreva na saída padrão.",
        expectedSolution: "print(int(input()) * 2)",
        languageId: languages.find((language) => language.key === "python")!.id,
        testCases: [
          { input: "3", expectedOutput: "6", visibility: "PUBLIC" },
          { input: "10", expectedOutput: "20", visibility: "PUBLIC" },
          { input: PRIVATE_INPUT, expectedOutput: PRIVATE_OUTPUT, visibility: "PRIVATE" },
        ],
      },
      {
        type: "MULTIPLE_CHOICE",
        statement: "Qual palavra declara herança em Java?",
        topicItemIds: [],
        alternatives: [
          { text: "extends", isCorrect: true },
          { text: "implements", isCorrect: false },
          { text: "inherits", isCorrect: false },
        ],
      },
    ],
  });
  return work.id;
}

/** "Nova atividade" → Trabalho → the work, with "Permitir executar o código" (and the controlled mode), then the call. */
async function applyWithCodeExecution(page: Page, seed: StudentPortalSeed, workTitle: string, controlled: boolean): Promise<string> {
  await page.goto(`/turmas/${seed.classId}/atividades/nova`);
  await page.getByRole("radio", { name: "Trabalho", exact: true }).check();
  await page.getByRole("radio", { name: new RegExp(workTitle) }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await field(page, "Prazo de entrega").fill(localInput(new Date(Date.now() + 7 * 24 * 3_600_000)));
  const option = page.getByRole("checkbox", { name: "Permitir executar o código" });
  // 021/SC-006: one interaction more — the option is there, unchecked.
  await expect(option).not.toBeChecked();
  await option.check();
  if (controlled) await page.getByRole("checkbox", { name: "Modo controlado" }).check();
  await page.getByRole("button", { name: "Publicar atividade" }).click();
  await expect(page).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Execução de código: permitida")).toBeVisible();
  const activityId = new URL(page.url()).pathname.split("/").at(-1)!;
  await releaseToPresent(page);
  return activityId;
}

/**
 * 021 — the Code Runner in a work, on the real screens with the real worker and Docker: the teacher applies a
 * work with "Permitir executar o código"; the student, by keyboard only, runs on the normal screen, leaves the
 * room (the questions disappear), resumes after "Liberar retorno", runs again and submits ("Executar" is gone);
 * the teacher reads the run summary in the correction, without code or output. A second work in the controlled
 * mode runs inside the focus page.
 */
test.describe("021 Code Runner nos trabalhos", () => {
  let seed: StudentPortalSeed;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    seed = await seedStudentPortal(browser);
  });

  test("021/SC-001 021/SC-006 021/SC-008 professor permite, aluno executa pelo teclado, sai e volta, entrega; professor vê o resumo", async ({ browser }) => {
    test.setTimeout(300_000);
    const workTitle = `Dobro em trabalho ${unique()}`;
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await createCodeWork(teacherPage, seed, workTitle);
    const activityId = await applyWithCodeExecution(teacherPage, seed, workTitle, false);
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });

    // The student, by keyboard only: a right program, both public cases pass.
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);
    await press(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await expect(page.getByText("Python 3.13", { exact: false })).toBeVisible();
    await writeCode(page, "print(int(input()) * 2)");
    await press(page, runButton(page));
    await expect(result(page).getByText("2 de 2 casos públicos passaram")).toBeVisible({ timeout: 30_000 });
    let text = await page.locator("body").innerText();
    expect(text).not.toContain(PRIVATE_INPUT);
    expect(text).not.toContain(PRIVATE_OUTPUT);

    // "Sair da sala": the questions and "Executar" disappear until the teacher releases the return.
    await press(page, page.getByRole("button", { name: "Sair da sala" }));
    const exit = page.getByRole("dialog", { name: "Sair da sala" });
    await tabTo(page, exit.getByRole("radio", { name: "Ir ao banheiro" }), 20);
    await page.keyboard.press("Space");
    await press(page, exit.getByRole("button", { name: "Confirmar saída" }));
    await expect(page.getByText("Atividade pausada")).toBeVisible();
    await expect(runButton(page)).toHaveCount(0);
    await press(teacherPage, attendance.getByRole("button", { name: `Liberar retorno ${seed.student.name}` }));
    await expect(page.getByText("Retorno liberado")).toBeVisible(WITHIN_10_S);
    await press(page, page.getByRole("button", { name: "Retomar", exact: true }));

    // A wrong program after the return: each case in words.
    await writeCode(page, "print(int(input()) * 3)");
    await press(page, runButton(page));
    await expect(result(page).getByText("0 de 2 casos públicos passaram")).toBeVisible({ timeout: 30_000 });
    await expect(result(page).getByRole("list", { name: "Casos públicos" }).getByRole("button").first()).toContainText("Saída diferente");

    // Submitting is the 012 flow; afterwards "Executar" is gone.
    await page.getByRole("button", { name: /^Questão 2\b/ }).click();
    await page.getByRole("radio", { name: /extends/ }).check();
    await press(page, page.getByRole("button", { name: "Entregar atividade" }));
    const confirm = page.getByRole("alertdialog", { name: "Entregar atividade?" });
    await press(page, confirm.getByRole("button", { name: "Entregar", exact: true }));
    await expect(page.getByText(/^Atividade entregue em /)).toBeVisible();
    await expect(runButton(page)).toHaveCount(0);
    text = await page.locator("body").innerText();
    expect(text).not.toContain(PRIVATE_INPUT);
    await page.context().close();

    // The teacher, in the correction: the summary of question 1, no code or output, the grade still blank.
    await teacherPage.goto(`/turmas/${seed.classId}/atividades/${activityId}?aba=alunos`);
    await teacherPage.getByRole("link", { name: seed.student.name }).click();
    await expect(teacherPage.getByRole("heading", { name: `Tentativa de ${seed.student.name}` })).toBeVisible();
    const summary = teacherPage.getByRole("region", { name: "Execuções do aluno na questão 1" });
    await expect(summary.getByText("2 execuções")).toBeVisible();
    await expect(summary.getByText("Última execução: 0 de 2 casos públicos passaram")).toBeVisible();
    const cases = summary.getByRole("list", { name: "Casos públicos da última execução" });
    await expect(cases.getByRole("listitem")).toHaveText(["Caso 1: Saída diferente", "Caso 2: Saída diferente"]);
    const summaryText = await summary.innerText();
    // No code, input or output: the program, the obtained output section and the private case are absent.
    for (const content of ["print(", "input()", "Saída obtida", "Entrada", PRIVATE_INPUT, PRIVATE_OUTPUT]) expect(summaryText).not.toContain(content);
    await teacherPage.context().close();
  });

  test("021/SC-008 em modo controlado, o aluno executa pelo teclado na tela de foco", async ({ browser }) => {
    test.setTimeout(240_000);
    const workTitle = `Dobro controlado ${unique()}`;
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await createCodeWork(teacherPage, seed, workTitle);
    const activityId = await applyWithCodeExecution(teacherPage, seed, workTitle, true);
    await teacherPage.context().close();

    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);
    await press(page, page.getByRole("button", { name: "Iniciar em modo controlado" }));
    await expect(page).toHaveURL(new RegExp(`/minhas-atividades/${activityId}/responder$`));
    await writeCode(page, "print(int(input()) * 2)");
    await press(page, runButton(page));
    await expect(result(page).getByText("2 de 2 casos públicos passaram")).toBeVisible({ timeout: 30_000 });
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(PRIVATE_INPUT);
    expect(text).not.toContain(PRIVATE_OUTPUT);
    await page.context().close();
  });
});
