import { type Browser, expect, type Page, test } from "@playwright/test";
import { WEB_URL } from "./env.ts";
import { apiPost, logIn } from "./fixtures/journeys.ts";
import { markAllPresentThroughApi, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/**
 * 028 — the redesigned Histórico on the real screens: a student with two delivered works, one released, sees the cards
 * 2/1/1, the graded row with its grade and bar, "Corrigidas" with only the released one, the search narrowing the list,
 * and at 360 px, in the dark and light themes (the account's, 022), no horizontal scroll with the rows as cards.
 * 029: the Histórico holds only what the teacher closed or cancelled, so the teacher closes both deliveries and a work
 * never delivered ("Não entregues") and cancels a delivered one ("Canceladas", no grade or link); a delivered work the
 * teacher left ACTIVE stays in "Minhas atividades". The works have only multiple-choice questions, so a blank submission
 * is graded at once and can be released.
 */

const RELEASED = "Prova liberada E2E";
const PENDING = "Trabalho pendente E2E";
/** Closed by the teacher with no delivery — only in the Histórico, under "Não entregues". */
const CLOSED = "Trabalho encerrado E2E";
/** 029/FR-005: delivered, then cancelled by the teacher — only in "Canceladas". */
const CANCELLED = "Trabalho cancelado E2E";
/** 029/FR-007: delivered and still ACTIVE — only in "Minhas atividades". */
const ACTIVE = "Trabalho ativo entregue E2E";

/** A work of one multiple-choice question in the seed's subject, applied to its class; returns the activity id. */
async function applyChoiceWork(teacherPage: Page, seed: StudentPortalSeed, title: string): Promise<string> {
  const work = await apiPost<{ id: string }>(teacherPage, "/works", {
    subjectId: seed.subjectId,
    title,
    totalGrade: "1.00",
    topics: null,
    status: "APPROVED",
    questions: [
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
  const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
    idempotencyKey: crypto.randomUUID(),
    source: { type: "ASSIGNMENT", workId: work.id },
    title,
    publishAt: null,
    deadline: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    latePolicy: "REJECT",
    acknowledgeOutOfScope: false,
  });
  await markAllPresentThroughApi(teacherPage, seed.classId, activity.id);
  return activity.id;
}

/** The student starts and hands in `activityId` with no answer (graded at once: 0,00 of 1,00). */
async function deliver(studentPage: Page, activityId: string): Promise<void> {
  await apiPost(studentPage, `/me/activities/${activityId}/attempt`, {});
  await apiPost(studentPage, `/me/activities/${activityId}/attempt/submit`, { answers: [] });
}

async function setTheme(page: Page, theme: "DARK" | "LIGHT"): Promise<void> {
  const res = await page.request.patch("/api/me/preferences", { data: { theme }, headers: { Origin: WEB_URL } });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

async function seedHistory(browser: Browser): Promise<StudentPortalSeed> {
  const seed = await seedStudentPortal(browser);
  const teacherPage = await (await browser.newContext()).newPage();
  await logIn(teacherPage, seed.teacher, "/disciplinas");
  const released = await applyChoiceWork(teacherPage, seed, RELEASED);
  const pending = await applyChoiceWork(teacherPage, seed, PENDING);
  const closed = await applyChoiceWork(teacherPage, seed, CLOSED);
  const cancelled = await applyChoiceWork(teacherPage, seed, CANCELLED);
  const active = await applyChoiceWork(teacherPage, seed, ACTIVE);

  const studentPage = await (await browser.newContext()).newPage();
  await logIn(studentPage, seed.student, "/painel");
  await deliver(studentPage, pending);
  await deliver(studentPage, released);
  await deliver(studentPage, cancelled);
  await deliver(studentPage, active);
  await studentPage.context().close();

  const activityPath = (id: string, action: string) => `/classes/${seed.classId}/activities/${id}/${action}`;
  await apiPost(teacherPage, activityPath(released, "release"), {});
  // 029/FR-001: only what the teacher closed or cancelled reaches the Histórico.
  for (const id of [released, pending, closed]) await apiPost(teacherPage, activityPath(id, "close"), {});
  await apiPost(teacherPage, activityPath(cancelled, "cancel"), {});
  await teacherPage.context().close();
  return seed;
}

test.describe("028 Histórico redesenhado", () => {
  let seed: StudentPortalSeed;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    seed = await seedHistory(browser);
  });

  test("028/US1-1 028/US2-3 028/US3-1 cards 2/1/1, a nota com a barra, Corrigidas só a liberada e a busca", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, "/historico");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const summary = page.getByRole("region", { name: "Resumo das suas entregas" });
    await expect(summary.getByText("2 atividades entregues")).toBeAttached();
    await expect(summary.getByText("1 aguardando correção")).toBeAttached();
    await expect(summary.getByText("1 atividade corrigida")).toBeAttached();

    const graded = page.getByRole("row").filter({ hasText: RELEASED });
    await expect(graded.getByRole("progressbar", { name: "Nota 0,00 de 1,00" })).toBeVisible();
    const awaiting = page.getByRole("row").filter({ hasText: PENDING });
    await expect(awaiting.getByText("Aguardando correção")).toBeVisible();
    await expect(awaiting.getByRole("progressbar")).toHaveCount(0);

    await page.getByRole("tab", { name: "Corrigidas, 1" }).click();
    await expect(page).toHaveURL(/aba=corrigidas/);
    await expect(page.getByRole("row").filter({ hasText: RELEASED })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: PENDING })).toHaveCount(0);

    await page.getByRole("tab", { name: "Todas, 4" }).click();
    await page.getByRole("searchbox", { name: "Buscar atividade" }).fill("pendente");
    await expect(page).toHaveURL(/busca=pendente/);
    await expect(page.getByRole("row").filter({ hasText: PENDING })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: RELEASED })).toHaveCount(0);
    await expect(summary.getByText("2 atividades entregues")).toBeAttached();
    await page.context().close();
  });

  test("028/US5-2 029/US1-1 029/US2-4 encerradas e cancelada só no Histórico; a ativa entregue em Minhas atividades", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext()).newPage();
    await logIn(page, seed.student, "/minhas-atividades");
    // 029/FR-007: the delivered work the teacher left ACTIVE is in the list, also under "Entregues/concluídas".
    await expect(page.getByRole("heading", { name: ACTIVE })).toBeVisible();
    for (const title of [RELEASED, PENDING, CLOSED, CANCELLED]) await expect(page.getByText(title)).toHaveCount(0);
    await page.goto("/minhas-atividades?situacao=concluidas");
    await expect(page.getByLabel("Situação")).toHaveValue("COMPLETED");
    await expect(page.getByRole("heading", { name: ACTIVE })).toBeVisible();

    await page.goto("/historico");
    await expect(page.getByRole("tab", { name: "Todas, 4" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: ACTIVE })).toHaveCount(0);
    await page.getByRole("tab", { name: "Não entregues, 1" }).click();
    await expect(page).toHaveURL(/aba=nao-entregues/);
    const row = page.getByRole("row").filter({ hasText: CLOSED });
    await expect(row.getByText("Não entregue")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: PENDING })).toHaveCount(0);

    // 029/US2-4: the cancelled one, with "Cancelada", "—" and no link.
    await page.getByRole("tab", { name: "Canceladas, 1" }).click();
    await expect(page).toHaveURL(/aba=canceladas/);
    const cancelledRow = page.getByRole("row").filter({ hasText: CANCELLED });
    await expect(cancelledRow.getByText("Cancelada", { exact: true })).toBeVisible();
    await expect(cancelledRow.getByText("—")).toBeVisible();
    await expect(cancelledRow.getByRole("link")).toHaveCount(0);
    const summary = page.getByRole("region", { name: "Resumo das suas entregas" });
    await expect(summary.getByText("2 atividades entregues")).toBeAttached();
    await page.context().close();
  });

  for (const theme of ["DARK", "LIGHT"] as const) {
    test(`028/SC-007 029/SC-006 360 px no tema ${theme === "DARK" ? "escuro" : "claro"}: sem rolagem horizontal, linhas como cartões`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage();
      await logIn(page, seed.student, "/painel");
      await setTheme(page, theme);
      await page.goto("/historico");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "DARK" ? "dark" : "light");
      await page.setViewportSize({ width: 360, height: 800 });

      const cards = page.getByRole("list", { name: "Atividades que você entregou." });
      await expect(cards.getByRole("listitem").filter({ hasText: RELEASED })).toBeVisible();
      await expect(cards.getByRole("listitem").filter({ hasText: PENDING })).toBeVisible();
      await expect(cards.getByRole("listitem").filter({ hasText: CANCELLED })).toBeVisible();
      await expect(page.getByRole("table")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await setTheme(page, "DARK");
      await context.close();
    });
  }
});
