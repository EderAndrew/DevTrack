import { expect, type Locator, type Page, test } from "@playwright/test";
import { unique } from "./fixtures/curriculum.ts";
import { bootstrapAdmin, logIn } from "./fixtures/journeys.ts";
import { applyExercisesThroughApi, type ExercisePointsSeed, seedExercisePoints } from "./support/exercise-points-seed.ts";
import { apiPost, markAllPresentThroughApi } from "./support/student-portal-seed.ts";

/** Presses Tab until `target` has the focus; returns how many presses it took. */
async function tabTo(page: Page, target: Locator, max = 80): Promise<number> {
  for (let presses = 0; presses <= max; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return presses;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/**
 * 020 — feedback dos alunos on the real screens: the student sends a "Problema" from the Painel by
 * keyboard, in at most 3 interactions after typing (020/SC-001), and finds it in "Meus feedbacks"; the
 * button is on an exercise's page but not on the focus page of a CONTROLLED work (020/SC-006); the
 * ADMIN sees the count in the menu, filters, opens and resolves it, and the student sees "Resolvido"
 * (020/SC-002).
 */
test.describe("020 feedback dos alunos", () => {
  let seed: ExercisePointsSeed;

  test.beforeAll(async ({ browser }) => {
    seed = await seedExercisePoints(browser);
  });

  test("020/SC-001 020/SC-002 o aluno envia do Painel pelo teclado, o ADMIN resolve e o aluno vê \"Resolvido\"", async ({ browser }) => {
    test.setTimeout(120_000);
    const message = `A página travou ao salvar a resposta (${unique()}).`;

    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, "/painel");
    const started = Date.now();
    await tabTo(page, page.getByRole("button", { name: "Enviar feedback" }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Enviar feedback" });
    await expect(dialog).toBeVisible();
    await tabTo(page, dialog.getByRole("radio", { name: /^Problema/ }));
    await page.keyboard.press("Space");
    await expect(dialog.getByRole("radio", { name: /^Problema/ })).toBeChecked();
    await tabTo(page, dialog.getByLabel("Mensagem"));
    await page.keyboard.type(message);
    // SC-001: after typing, at most 3 interactions to send (the Tabs to "Enviar" and Enter).
    const presses = await tabTo(page, dialog.getByRole("button", { name: "Enviar", exact: true }), 5);
    await page.keyboard.press("Enter");
    expect(presses + 1).toBeLessThanOrEqual(3);
    await expect(page.getByText("Feedback enviado. Obrigado!")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(Date.now() - started).toBeLessThan(60_000);

    await page.getByRole("link", { name: "Meus feedbacks" }).click();
    await expect(page.getByRole("heading", { name: "Meus feedbacks", level: 1 })).toBeVisible();
    const own = page.getByRole("listitem").filter({ hasText: message });
    await expect(own.getByText("Recebido")).toBeVisible();

    // The ADMIN: the count in the menu, the filter, the detail with the origin path, "Resolvido".
    const adminPage = await (await browser.newContext()).newPage();
    await logIn(adminPage, bootstrapAdmin(), "/admin/feedbacks");
    await expect(adminPage.getByRole("link", { name: /^Feedbacks, \d+ novos?$/ })).toBeVisible();
    await adminPage.getByLabel("Categoria").selectOption({ label: "Problema" });
    await expect(adminPage).toHaveURL(/categoria=problema/);
    await adminPage.getByRole("link", { name: message }).click();
    await expect(adminPage.getByText(message)).toBeVisible();
    await expect(adminPage.getByText(seed.student.email, { exact: false })).toBeVisible();
    await expect(adminPage.getByText("/painel", { exact: true })).toBeVisible();
    await adminPage.getByRole("button", { name: "Resolvido" }).click();
    await expect(adminPage.getByRole("button", { name: "Reabrir" })).toBeVisible();
    await adminPage.context().close();

    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: message }).getByText("Resolvido")).toBeVisible();
    await page.context().close();
  });

  test("020/SC-006 o botão está na página de um exercício e não na tentativa de um trabalho em modo controlado", async ({ browser }) => {
    test.setTimeout(120_000);
    const exerciseId = await applyExercisesThroughApi(browser, seed, `Exercícios do feedback ${unique()}`);

    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const work = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
      idempotencyKey: crypto.randomUUID(),
      source: { type: "ASSIGNMENT", workId: seed.workId },
      title: `${seed.workTitle} (controlado, feedback)`,
      publishAt: null,
      deadline: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
      latePolicy: "REJECT",
      acknowledgeOutOfScope: false,
      executionMode: "CONTROLLED",
      aiHelpAllowance: 0,
    });
    await markAllPresentThroughApi(teacherPage, seed.classId, work.id);
    await teacherPage.context().close();

    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, `/minhas-atividades/${exerciseId}`);
    await expect(page.getByRole("button", { name: "Enviar feedback" })).toBeVisible();

    await page.goto(`/minhas-atividades/${work.id}`);
    await page.getByRole("button", { name: "Iniciar em modo controlado" }).click();
    await expect(page).toHaveURL(new RegExp(`/minhas-atividades/${work.id}/responder$`));
    await expect(page.getByRole("navigation", { name: "Questões" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar feedback" })).toHaveCount(0);
    await page.context().close();
  });
});
