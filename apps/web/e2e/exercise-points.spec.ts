import { expect, type Locator, type Page, test } from "@playwright/test";
import { field, logIn } from "./fixtures/journeys.ts";
import { applyExercisesThroughApi, type ExercisePointsSeed, POINT_EXERCISES, seedExercisePoints } from "./support/exercise-points-seed.ts";

const answerBox = (page: Page) => page.getByLabel("Sua resposta");
const savedStatus = (page: Page) => page.getByText("Resposta salva", { exact: true }).first();
const goToQuestion = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Questão ${n}\\b`) }).click();
const fitsTheScreen = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Presses Tab until `target` has the focus (keyboard only, 013/SC-008). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/** The ranking row of `name` as [position, name, points] cell texts. */
async function rankingRow(scope: Page | Locator, name: string): Promise<string[]> {
  const row = scope.getByRole("row").filter({ hasText: name });
  // The ranking loads after the page: wait for the row before reading its cells.
  await expect(row).toBeVisible();
  return row.getByRole("cell").allInnerTexts();
}

/**
 * 013 — exercise points on the real screens: the teacher applies one exercise of each level (no grade,
 * deadline or late policy; "Total: 105 pontos"); the student concludes, sees the answer key and 15
 * points, retries without earning more; the teacher marks the open answer right; the student's and the
 * teacher's ranking show 45 points; the practice cycle by keyboard only; a 360 px phone without
 * horizontal scroll, and the student's own position found from the dashboard within 10 s.
 */
test.describe("013 pontos dos exercícios e ranking", () => {
  let seed: ExercisePointsSeed;

  test.beforeAll(async ({ browser }) => {
    seed = await seedExercisePoints(browser);
  });

  test("013/US1-1 013/US2-2 013/US2-5 013/US3-1 013/US4-4 013/US5-1 aplicar → concluir → refazer → marcar → ranking", async ({ browser }) => {
    test.setTimeout(180_000);
    const title = "Prática de construtores";
    // The teacher applies the three exercises: points by level, no grade, deadline or late policy.
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, `/turmas/${seed.classId}/atividades/nova`);
    await teacherPage.getByRole("radio", { name: "Exercício", exact: true }).check();
    for (const exercise of POINT_EXERCISES) await teacherPage.getByRole("checkbox", { name: new RegExp(exercise.statement) }).check();
    await expect(teacherPage.getByText("Total: 105 pontos", { exact: true })).toBeVisible();
    await teacherPage.getByRole("button", { name: "Continuar" }).click();
    await expect(teacherPage.getByLabel(/Nota total|Prazo de entrega/)).toHaveCount(0);
    await field(teacherPage, "Título").fill(title);
    await teacherPage.getByRole("button", { name: "Publicar atividade" }).click();
    await expect(teacherPage).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
    const activityPath = new URL(teacherPage.url()).pathname;

    // The student concludes attempt 1: the multiple choice right, the Intermediário answered, the Avançado blank.
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, "/painel");
    await page.getByRole("article", { name: title }).getByRole("link", { name: "Iniciar" }).click();
    await page.getByRole("button", { name: "Iniciar atividade" }).click();
    await page.getByRole("radio", { name: /new/ }).check();
    await goToQuestion(page, 2);
    await answerBox(page).fill("Ele inicia o objeto.");
    await expect(savedStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "Concluir exercícios" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Concluir estes exercícios?" });
    await expect(dialog.getByText("1 exercício em branco vale 0 ponto nesta conclusão.")).toBeVisible();
    await dialog.getByRole("button", { name: "Concluir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resultado da tentativa 1" })).toBeVisible();
    await expect(page.getByText("Você ganhou 15 pontos.")).toBeVisible();
    // The answer key and the explanation arrive with the conclusion.
    await expect(page.getByText(POINT_EXERCISES[1].expectedAnswer)).toBeVisible();
    await expect(page.getByText(`Explicação: ${POINT_EXERCISES[0].statement}`)).toBeVisible();

    // "Refazer": everything right, no new points.
    await page.getByRole("button", { name: "Refazer" }).click();
    await expect(page.getByText("Tentativa 2. Refazer não vale pontos.")).toBeVisible();
    await page.getByRole("radio", { name: /new/ }).check();
    await expect(savedStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "Concluir exercícios" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Concluir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resultado da tentativa 2" })).toBeVisible();
    await expect(page.getByText("Refazer não vale pontos. Seus pontos nesta atividade: 15 pontos.")).toBeVisible();

    // The teacher marks the Intermediário right, with a comment: 30 more points, at once.
    await teacherPage.goto(activityPath);
    await teacherPage.getByRole("link", { name: seed.student.name }).click();
    await expect(teacherPage.getByRole("heading", { name: `Tentativa de ${seed.student.name}` })).toBeVisible();
    await teacherPage.getByRole("group", { name: "Correção do exercício 2" }).getByRole("radio", { name: "Certo" }).check();
    await teacherPage.getByLabel("Comentário do exercício 2 (opcional)").fill("Isso mesmo.");
    await teacherPage.getByRole("button", { name: "Salvar correção" }).click();
    await expect(teacherPage.getByText("Correção salva.")).toBeVisible();

    // Both rankings show 45 points; the student's row says "Você".
    await teacherPage.goto(`/turmas/${seed.classId}/ranking`);
    expect(await rankingRow(teacherPage, seed.student.name)).toEqual(["1º", seed.student.name, "45"]);
    await teacherPage.context().close();
    await page.goto("/painel");
    await page.getByRole("link", { name: `Ver ranking completo de ${seed.className}` }).click();
    // The dashboard card has a row with the same name: read the full page's only after it opens.
    await expect(page).toHaveURL(`/minhas-turmas/${seed.classId}/ranking`);
    await expect(page.getByRole("heading", { level: 1, name: `Ranking — ${seed.className}` })).toBeVisible();
    const own = await rankingRow(page, seed.student.name);
    expect(own[0]).toBe("1º");
    expect(own[1]).toContain("Você");
    expect(own[2]).toBe("45");
    await page.goto(`/minhas-atividades/${activityPath.split("/").pop()}`);
    await page.getByRole("button", { name: /^Tentativa 1 — / }).click();
    await expect(page.getByText("Isso mesmo.")).toBeVisible();
    await page.context().close();
  });

  test("013/SC-008 praticar → concluir → ver gabarito → refazer só com o teclado", async ({ browser }) => {
    test.setTimeout(120_000);
    const activityId = await applyExercisesThroughApi(browser, seed, "Prática pelo teclado");
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${activityId}`);

    await tabTo(page, page.getByRole("button", { name: "Iniciar atividade" }));
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    await tabTo(page, page.getByRole("radio").first());
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { name: /new/ })).toBeChecked();
    await tabTo(page, page.getByRole("button", { name: "Próxima" }));
    await page.keyboard.press("Enter");
    await tabTo(page, answerBox(page));
    await page.keyboard.type("Resposta escrita só com o teclado.");
    await tabTo(page, page.getByRole("button", { name: "Concluir exercícios" }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("alertdialog", { name: "Concluir estes exercícios?" });
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("button", { name: "Concluir", exact: true }), 5);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Resultado da tentativa 1" })).toBeVisible();
    await expect(page.getByText(POINT_EXERCISES[2].expectedAnswer)).toBeVisible();
    await tabTo(page, page.getByRole("button", { name: "Refazer" }));
    await page.keyboard.press("Enter");
    await expect(page.getByText("Tentativa 2. Refazer não vale pontos.")).toBeVisible();
    await page.context().close();
  });

  test("013/SC-008 celular de 360 px: painel, ranking e resultado sem rolagem horizontal; a própria posição em até 10 s", async ({ browser }) => {
    test.setTimeout(120_000);
    const activityId = await applyExercisesThroughApi(browser, seed, "Prática no celular");
    const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await logIn(page, seed.student, "/painel");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // From the dashboard to the student's own row of the full ranking.
    const started = Date.now();
    await page.getByRole("link", { name: `Ver ranking completo de ${seed.className}` }).click();
    await expect(page).toHaveURL(`/minhas-turmas/${seed.classId}/ranking`);
    await expect(page.getByRole("table", { name: `Ranking da turma ${seed.className}` }).getByRole("row").filter({ hasText: "Você" })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await fitsTheScreen(page), "ranking").toBe(true);

    await page.goto("/painel");
    await expect(page.getByRole("region", { name: `Ranking — ${seed.className}` })).toBeVisible();
    expect(await fitsTheScreen(page), "painel").toBe(true);

    await page.goto(`/minhas-atividades/${activityId}`);
    await page.getByRole("button", { name: "Iniciar atividade" }).click();
    await page.getByRole("button", { name: "Concluir exercícios" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Concluir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resultado da tentativa 1" })).toBeVisible();
    expect(await fitsTheScreen(page), "resultado").toBe(true);
    await context.close();
  });
});
