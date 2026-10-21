import { expect, type Locator, type Page, test } from "@playwright/test";
import { unique } from "./fixtures/curriculum.ts";
import { field, logIn } from "./fixtures/journeys.ts";
import { seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** The private case: its input and expected output must appear nowhere on the student's page. */
const PRIVATE_INPUT = "4242";
const PRIVATE_OUTPUT = "8484";

const editor = (page: Page) => page.getByRole("textbox", { name: /^Sua resposta/ });
const runButton = (page: Page) => page.getByRole("button", { name: "Executar", exact: true });
const result = (page: Page) => page.getByRole("region", { name: "Resultado da execução" });
const isFocused = (target: Locator) => target.evaluate((element) => element === document.activeElement);

/** Presses Tab until `target` has the focus, leaving the code editor with Esc first (014/FR-010). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await isFocused(target)) return;
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="code-editor"]')))) await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/** Replaces the editor's code by keyboard only (the editor never alters typed text, 014). */
async function writeCode(page: Page, code: string): Promise<void> {
  const target = editor(page);
  await expect(target).toHaveClass(/cm-content/);
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(code);
}

/** "Executar" by keyboard: Esc leaves the editor, Tab reaches the button, Enter runs. */
async function runByKeyboard(page: Page): Promise<void> {
  await tabTo(page, runButton(page));
  await page.keyboard.press("Enter");
}

/**
 * 019 — the Code Runner on the real screens, with the real worker and Docker (started by
 * playwright.config.ts): the teacher creates a Python exercise with two public cases and a private
 * one ("Os alunos poderão executar o código.") and applies it; the student, by keyboard only, runs a
 * right program, a wrong one and one with a syntax error, reading each verdict in words; the private
 * case appears nowhere on the page; concluding works as in 013 ("Aguardando correção").
 */
test.describe("019 Code Runner nos exercícios", () => {
  let seed: StudentPortalSeed;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    seed = await seedStudentPortal(browser);
  });

  test("019/SC-002 019/SC-008 professor cadastra casos e aplica; aluno executa certo, errado e com erro de sintaxe pelo teclado", async ({ browser }) => {
    test.setTimeout(240_000);
    const statement = `Leia um inteiro e imprima o dobro ${unique()}`;
    const title = "Dobro com execução";

    // The teacher: a single Python CODE exercise with 2 public cases and 1 private one.
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/exercicios/novo/avulso");
    const form = teacherPage.getByRole("form", { name: "Novo exercício" });
    await form.getByLabel(/^Tipo/).selectOption({ label: "Exercício de código" });
    await form.getByLabel(/^Enunciado/).fill(statement);
    await form.getByLabel(/^Dificuldade/).selectOption({ label: "Básico" });
    await form.getByLabel(/^Objetivo cognitivo/).selectOption({ label: "Aplicar" });
    await form.getByLabel(/^Instruções/).fill("Leia da entrada padrão e escreva na saída padrão.");
    await form.getByLabel(/^Solução esperada/).fill("print(int(input()) * 2)");
    await form.getByLabel(/^Linguagem/).selectOption({ label: "Python" });
    await expect(form.getByText("Os alunos poderão executar o código.")).toBeVisible();
    await form.getByLabel(/^Explicação/).fill("Multiplica a entrada por dois.");
    const cases = form.getByRole("group", { name: "Casos de teste" });
    for (const [n, [input, output]] of [
      ["3", "6"],
      ["10", "20"],
      [PRIVATE_INPUT, PRIVATE_OUTPUT],
    ].entries()) {
      await cases.getByRole("button", { name: "Adicionar caso" }).click();
      const testCase = cases.getByRole("group", { name: `Caso de teste ${n + 1}` });
      await testCase.getByLabel(/^Entrada do caso/).fill(input!);
      await testCase.getByLabel(/^Saída esperada do caso/).fill(output!);
    }
    await cases.getByRole("group", { name: "Caso de teste 3" }).getByRole("radio", { name: /^Privado/ }).check();
    await teacherPage.getByRole("button", { name: "Salvar no banco" }).click();
    await expect(teacherPage).toHaveURL(/\/exercicios\?criados=1$/);

    // Applied as an Exercício activity (012/013).
    await teacherPage.goto(`/turmas/${seed.classId}/atividades/nova`);
    await teacherPage.getByRole("radio", { name: "Exercício", exact: true }).check();
    await teacherPage.getByRole("checkbox", { name: new RegExp(statement) }).check();
    await teacherPage.getByRole("button", { name: "Continuar" }).click();
    await field(teacherPage, "Título").fill(title);
    await teacherPage.getByRole("button", { name: "Publicar atividade" }).click();
    await expect(teacherPage).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
    const activityId = new URL(teacherPage.url()).pathname.split("/").pop()!;
    await teacherPage.context().close();

    // The student, by keyboard only.
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);
    await tabTo(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("Python 3.13", { exact: false })).toBeVisible();

    // Right: both public cases pass.
    await writeCode(page, "print(int(input()) * 2)");
    await runByKeyboard(page);
    await expect(result(page).getByText("2 de 2 casos públicos passaram")).toBeVisible({ timeout: 30_000 });
    await expect(runButton(page)).toBeEnabled();

    // Wrong: the earlier result is marked stale, then each case says "Saída diferente".
    await writeCode(page, "print(int(input()) * 3)");
    await expect(page.getByText("Este resultado é de uma versão anterior do seu código.")).toBeVisible();
    await runByKeyboard(page);
    await expect(result(page).getByText("0 de 2 casos públicos passaram")).toBeVisible({ timeout: 30_000 });
    const firstCase = result(page).getByRole("list", { name: "Casos públicos" }).getByRole("button").first();
    await expect(firstCase).toContainText("Saída diferente");
    await expect(firstCase).toHaveAttribute("aria-expanded", "true");
    await expect(result(page).getByText("Saída obtida").first()).toBeVisible();

    // Syntax error: the compiler's message, no case.
    await writeCode(page, "print(");
    await runByKeyboard(page);
    await expect(result(page).getByText("Erro de compilação")).toBeVisible({ timeout: 30_000 });

    // SC-002: the private case is nowhere on the page.
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(PRIVATE_INPUT);
    expect(text).not.toContain(PRIVATE_OUTPUT);

    // Running never concluded or saved anything by itself: concluding is the 013 flow.
    await writeCode(page, "print(int(input()) * 2)");
    await expect(page.getByText("Resposta salva", { exact: true }).first()).toBeVisible();
    await tabTo(page, page.getByRole("button", { name: "Concluir exercícios" }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Concluir estes exercícios?" });
    await tabTo(page, dialog.getByRole("button", { name: "Concluir", exact: true }), 5);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Resultado da tentativa 1" })).toBeVisible();
    await expect(page.getByText("Aguardando correção").first()).toBeVisible();
    await page.context().close();
  });
});
