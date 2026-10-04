import { type Browser, type BrowserContextOptions, expect, type Locator, type Page, test } from "@playwright/test";
import { field, logIn } from "./fixtures/journeys.ts";
import { applyExercisesThroughApi, CODE_EXERCISES, type CodeExercisesSeed, seedCodeExercises } from "./support/exercise-points-seed.ts";

const editor = (page: Page | Locator) => page.getByRole("textbox", { name: /^Sua resposta/ });
const savedStatus = (page: Page) => page.getByText("Resposta salva", { exact: true }).first();
const goToQuestion = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Questão ${n}\\b`) }).click();
const fitsTheScreen = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const isFocused = (target: Locator) => target.evaluate((element) => element === document.activeElement);
const colored = (scope: Locator) => scope.locator('[class*="text-syntax-"]');

/** The text of the editor: the textarea's value, or CodeMirror's lines (what is read and saved). */
const editorText = (target: Locator) =>
  target.evaluate((element) =>
    element instanceof HTMLTextAreaElement ? element.value : [...element.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "").join("\n"),
  );

/** Waits for the CodeMirror editor (the textarea is swapped once the chunk arrives). */
async function codeMirror(page: Page): Promise<Locator> {
  const target = editor(page);
  await expect(target).toHaveClass(/cm-content/);
  return target;
}

/** The editor's content at the end of the document. */
async function focusEnd(page: Page, target: Locator): Promise<void> {
  await target.click();
  await page.keyboard.press("ControlOrMeta+End");
}

/** Presses Tab until `target` has the focus, leaving a code editor with Esc first (FR-010). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await isFocused(target)) return;
    if (await page.evaluate(() => Boolean(document.activeElement?.closest('[data-slot="code-editor"]')))) await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

async function studentPage(browser: Browser, seed: CodeExercisesSeed, path: string, options: BrowserContextOptions = {}): Promise<Page> {
  const page = await (await browser.newContext(options)).newPage();
  await logIn(page, seed.student, path);
  return page;
}

/** Concludes the open attempt from the answering page. */
async function conclude(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Concluir exercícios" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Resultado da tentativa \d/ })).toBeVisible();
}

// Tabs, trailing spaces, accents and an emoji: the text must come back character by character (SC-002).
const TYPED_TAIL = "\n\tint total = 1;  \n  // ação 😀  ";
const PASTED = '<b>não é HTML</b> "aspas" (parênteses';

/**
 * 014 — colored code on the real screens: the student's editor (Java colored, Go without a grammar),
 * the text round trip through autosave, reload, the offline buffer and the conclusion, the colored
 * result and the teacher's attempt, the bank form changing the language, keyboard only on desktop and
 * phone, touch on a phone, a 360 px screen without horizontal scroll, and the SC-004 timings.
 */
test.describe("014 realce de sintaxe do código", () => {
  let seed: CodeExercisesSeed;

  test.beforeAll(async ({ browser }) => {
    seed = await seedCodeExercises(browser);
  });

  test("014/US1-2 014/US1-4 014/US2-1 014/US2-2 014/SC-001 014/SC-002 responder colorido, recarregar, offline, concluir e ler", async ({ browser }) => {
    test.setTimeout(180_000);
    const activityId = await applyExercisesThroughApi(browser, seed, "Código colorido", [seed.javaExerciseId, seed.plainExerciseId]);
    const page = await studentPage(browser, seed, `/minhas-atividades/${activityId}`);
    await page.getByRole("button", { name: "Iniciar atividade" }).click();

    // Java: the starter code in color, then typed and pasted text kept exactly.
    const java = await codeMirror(page);
    await expect(page.getByRole("textbox", { name: "Sua resposta (Java)" })).toBeVisible();
    await expect(colored(java).filter({ hasText: /^class$/ })).toHaveClass(/text-syntax-keyword/);
    await focusEnd(page, java);
    await page.keyboard.insertText(TYPED_TAIL);
    await page.keyboard.insertText(PASTED);
    const expected = `${CODE_EXERCISES.java.starterCode}${TYPED_TAIL}${PASTED}`;
    await expect.poll(() => editorText(java)).toBe(expected);
    await expect(colored(java).filter({ hasText: "// ação 😀" })).toHaveClass(/text-syntax-comment/);
    await expect(page.locator("b")).toHaveCount(0);
    await expect(savedStatus(page)).toBeVisible();

    // Reloaded from the server: the same characters.
    await page.reload();
    await expect.poll(async () => editorText(await codeMirror(page))).toBe(expected);

    // Offline: kept in the buffer, sent when the connection returns, the same characters.
    await page.context().setOffline(true);
    const offline = await codeMirror(page);
    await focusEnd(page, offline);
    await page.keyboard.insertText("\n// offline ✓");
    await page.context().setOffline(false);
    await expect(savedStatus(page)).toBeVisible();
    const final = `${expected}\n// offline ✓`;
    await page.reload();
    await expect.poll(async () => editorText(await codeMirror(page))).toBe(final);

    // Go: no grammar in the catalog (SC-001), the editor works without colors.
    await goToQuestion(page, 2);
    const go = await codeMirror(page);
    await expect(page.getByRole("textbox", { name: "Sua resposta (Go)" })).toBeVisible();
    await focusEnd(page, go);
    await page.keyboard.insertText("\nfunc main() {}");
    await expect.poll(() => editorText(go)).toBe(`${CODE_EXERCISES.plain.starterCode}\nfunc main() {}`);
    await expect(colored(go)).toHaveCount(0);
    await expect(savedStatus(page)).toBeVisible();

    // The result: the answer and the reference solution in color for Java, plain for Go (US2-1).
    await conclude(page);
    const javaAnswer = page.getByRole("group", { name: "Sua resposta" }).first();
    await expect(colored(javaAnswer).first()).toBeVisible();
    expect(await javaAnswer.locator("code").textContent()).toBe(final);
    const javaSolution = page.getByRole("group", { name: "Solução de referência" }).first();
    await expect(colored(javaSolution).filter({ hasText: "// em reais" })).toHaveClass(/text-syntax-comment/);
    const goSolution = page.getByRole("group", { name: "Solução de referência" }).nth(1);
    expect(await goSolution.locator("code").textContent()).toBe(CODE_EXERCISES.plain.expectedSolution);
    await expect(colored(goSolution)).toHaveCount(0);
    await page.context().close();

    // The teacher's attempt: the student's code and the expected solution in color (US2-2).
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, `/turmas/${seed.classId}/atividades/${activityId}`);
    await teacherPage.getByRole("link", { name: seed.student.name }).click();
    await expect(teacherPage.getByRole("heading", { name: `Tentativa de ${seed.student.name}` })).toBeVisible();
    const answers = teacherPage.getByRole("group", { name: "Resposta do aluno" });
    await expect(colored(answers.first()).first()).toBeVisible();
    expect(await answers.first().locator("code").textContent()).toBe(final);
    await expect(colored(answers.nth(1))).toHaveCount(0);
    await expect(colored(teacherPage.getByRole("group", { name: "Solução esperada" }).first()).first()).toBeVisible();
    await teacherPage.context().close();
  });

  for (const [device, options] of [
    ["desktop", { viewport: { width: 1280, height: 800 } }],
    ["celular", { viewport: { width: 360, height: 740 } }],
  ] as const) {
    test(`014/US1-3 014/SC-006 responder, sair do editor e ler o gabarito só com o teclado (${device})`, async ({ browser }) => {
      test.setTimeout(120_000);
      const activityId = await applyExercisesThroughApi(browser, seed, `Código pelo teclado (${device})`, [seed.javaExerciseId]);
      const page = await studentPage(browser, seed, `/minhas-atividades/${activityId}`, options);
      await tabTo(page, page.getByRole("button", { name: "Iniciar atividade" }));
      await page.keyboard.press("Enter");
      const java = await codeMirror(page);
      await tabTo(page, java);
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.press("Enter");
      // Tab indents two spaces and keeps the focus in the editor.
      await page.keyboard.press("Tab");
      await page.keyboard.type("int x;");
      await expect.poll(() => editorText(java)).toBe(`${CODE_EXERCISES.java.starterCode}\n  int x;`);
      expect(await isFocused(java)).toBe(true);
      // Esc then Tab leaves; Shift+Tab comes back.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      expect(await isFocused(java)).toBe(false);
      await page.keyboard.press("Shift+Tab");
      expect(await isFocused(java)).toBe(true);
      await expect(savedStatus(page)).toBeVisible();

      await tabTo(page, page.getByRole("button", { name: "Concluir exercícios" }));
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("alertdialog", { name: "Concluir estes exercícios?" });
      await tabTo(page, dialog.getByRole("button", { name: "Concluir", exact: true }), 5);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Resultado da tentativa 1" })).toBeVisible();
      // The answer key is read as text; Tab moves past it (it is focusable only when it scrolls).
      const solution = page.getByRole("group", { name: "Solução de referência" });
      expect(await solution.locator("code").textContent()).toBe(CODE_EXERCISES.java.expectedSolution);
      await tabTo(page, page.getByRole("button", { name: "Refazer" }));
      await page.context().close();
    });
  }

  test("014/FR-012 014/US4-4 celular com toque: tocar, digitar e desfazer; 360 px sem rolagem horizontal", async ({ browser }) => {
    test.setTimeout(120_000);
    const activityId = await applyExercisesThroughApi(browser, seed, "Código no celular", [seed.javaExerciseId]);
    const page = await studentPage(browser, seed, `/minhas-atividades/${activityId}`, {
      viewport: { width: 360, height: 740 },
      hasTouch: true,
      isMobile: true,
    });
    await page.getByRole("button", { name: "Iniciar atividade" }).tap();
    const java = await codeMirror(page);
    await java.tap();
    expect(await isFocused(java)).toBe(true);
    await page.keyboard.press("ControlOrMeta+End");
    const longLine = '\nString mensagem = "uma linha bem longa que rola dentro do editor e nunca a página inteira";';
    await page.keyboard.insertText(longLine);
    await expect.poll(() => editorText(java)).toBe(`${CODE_EXERCISES.java.starterCode}${longLine}`);
    expect(await fitsTheScreen(page), "tela de responder").toBe(true);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => editorText(java)).toBe(CODE_EXERCISES.java.starterCode);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(() => editorText(java)).toBe(`${CODE_EXERCISES.java.starterCode}${longLine}`);
    await expect(savedStatus(page)).toBeVisible();
    await conclude(page);
    expect(await fitsTheScreen(page), "resultado").toBe(true);
    await page.context().close();
  });

  test("014/US3-2 formulário do banco: trocar a linguagem muda o realce e mantém o texto", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.teacher, "/exercicios/novo/avulso");
    await field(page, "Tipo").selectOption({ label: "Exercício de código" });
    const language = field(page, "Linguagem");
    await expect(language.getByRole("option", { name: "Python" })).toHaveCount(1);
    await language.selectOption({ label: "Python" });
    const solution = page.getByRole("textbox", { name: /^Solução esperada/ });
    await expect(solution).toHaveClass(/cm-content/);
    await solution.click();
    await page.keyboard.insertText("def f(): // nota");
    await expect(colored(solution).filter({ hasText: /^def$/ })).toHaveClass(/text-syntax-keyword/);
    await language.selectOption({ label: "Java" });
    await expect(colored(solution).filter({ hasText: "// nota" })).toHaveClass(/text-syntax-comment/);
    // In Java `def` is a plain name (colored as a type), no longer a keyword.
    await expect(solution.locator(".text-syntax-keyword").filter({ hasText: /^def$/ })).toHaveCount(0);
    expect(await editorText(solution)).toBe("def f(): // nota");
    await page.context().close();
  });

  test("014/SC-004 o editor colorido abre e digita tão rápido quanto o textarea", async ({ browser }) => {
    test.setTimeout(180_000);
    const activityId = await applyExercisesThroughApi(browser, seed, "Código e desempenho", [seed.javaExerciseId]);
    const started = await studentPage(browser, seed, `/minhas-atividades/${activityId}`);
    await started.getByRole("button", { name: "Iniciar atividade" }).click();
    await codeMirror(started);
    await started.context().close();

    /** Navigation → the answer box takes the first key, in a fresh context (no cache). */
    async function firstKey(blockEditor: boolean): Promise<number> {
      const page = await studentPage(browser, seed, "/painel");
      if (blockEditor) {
        // Baseline: the CodeMirror chunks never arrive, the editor stays the 012 textarea.
        await page.route("**/_next/static/chunks/*.js", async (route) => {
          const response = await route.fetch();
          const body = await response.text();
          if (/cm-content|EditorView/.test(body)) return route.abort();
          return route.fulfill({ response, body });
        });
      }
      const start = Date.now();
      await page.goto(`/minhas-atividades/${activityId}`);
      const box = editor(page);
      await box.focus();
      await page.keyboard.press("x");
      await expect.poll(() => editorText(editor(page)), { intervals: [10] }).toContain("x");
      const elapsed = Date.now() - start;
      if (blockEditor) await expect(editor(page)).not.toHaveClass(/cm-content/);
      await page.context().close();
      return elapsed;
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const baseline: number[] = [];
    const normal: number[] = [];
    for (let i = 0; i < 3; i++) {
      baseline.push(await firstKey(true));
      normal.push(await firstKey(false));
    }
    expect(median(normal), `linha de base ${baseline.join("/")} ms, normal ${normal.join("/")} ms`).toBeLessThanOrEqual(median(baseline) + 300);

    // Keys typed during the textarea → CodeMirror swap are kept; then 10 000 characters, ≤ 50 ms per key.
    const page = await studentPage(browser, seed, "/painel");
    await page.goto(`/minhas-atividades/${activityId}`);
    const box = editor(page);
    await box.focus();
    await page.keyboard.press("ControlOrMeta+End");
    const before = await editorText(box);
    await page.keyboard.type("abcdefghij", { delay: 5 });
    const java = await codeMirror(page);
    await expect.poll(() => editorText(java)).toBe(`${before}abcdefghij`);

    await java.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(`${"// linha de código comentada para medir a digitação\n".repeat(200)}`.slice(0, 10_000));
    // CodeMirror renders only the visible lines: the length is read from the saved answer.
    await expect
      .poll(async () => {
        const activity = (await (await page.request.get(`/api/me/activities/${activityId}`)).json()) as {
          attempt: { answers: { answer: { source?: string } }[] } | null;
        };
        return activity.attempt?.answers[0]?.answer.source?.length;
      })
      .toBe(10_000);
    // Per key: from the keydown to the content's DOM update, measured in the page.
    await java.evaluate((content) => {
      const state = { pending: 0, latencies: [] as number[] };
      (window as unknown as { __keys: typeof state }).__keys = state;
      content.addEventListener("keydown", () => (state.pending = performance.now()), { capture: true });
      new MutationObserver(() => {
        if (state.pending) state.latencies.push(performance.now() - state.pending);
        state.pending = 0;
      }).observe(content, { childList: true, subtree: true, characterData: true });
    });
    await page.keyboard.type("x = soma(a, b);", { delay: 60 });
    const latencies = await page.evaluate(() => (window as unknown as { __keys: { latencies: number[] } }).__keys.latencies);
    expect(latencies.length).toBeGreaterThan(10);
    expect(Math.max(...latencies), `latências ${latencies.map(Math.round).join(", ")} ms`).toBeLessThanOrEqual(50);
    await page.context().close();
  });
});
