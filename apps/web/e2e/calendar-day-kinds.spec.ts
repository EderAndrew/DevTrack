import { expect, type Page, test } from "@playwright/test";
import { WEB_URL } from "./env.ts";
import { createSubject, markDay, unique } from "./fixtures/curriculum.ts";
import { type Account, addClassThroughForm, classTeacher, createEnrolledStudent, logIn } from "./fixtures/journeys.ts";

/**
 * 031/SC-008 — the teacher marks a Prova, a Feriado and a Falta (with its private reason and a notice) and saves; the
 * enrolled student opens the Painel on that matéria, goes to the week with the arrows and sees each kind, the notice and
 * never the reason; on a 360 px phone the page never scrolls sideways, in the dark and the light theme. axe and the
 * contrast of the dots run in the unit tests (`student-calendar-card.test.tsx`, `day-kind-dialog.test.tsx`,
 * `contrast.test.ts`); this one needs a real layout and the real API.
 */

const REASON = "Consulta médica E2E 031";
const NOTICE = "Atividade no portal E2E 031";

/** Calendar dates ("YYYY-MM-DD") in America/Sao_Paulo, the zone of the server's "today" (CK7). */
const todayInSaoPaulo = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, days: number) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
};
const monday = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return addDays(iso, -((new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() + 6) % 7));
};
const monthOf = (iso: string) => iso.slice(0, 7);

async function setTheme(page: Page, theme: "DARK" | "LIGHT"): Promise<void> {
  const res = await page.request.patch("/api/me/preferences", { data: { theme }, headers: { Origin: WEB_URL } });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

test.describe("031 calendário com tipos de dia", () => {
  test.describe.configure({ mode: "serial" });
  let student: Account;
  let classId: string;
  let subjectName: string;
  // The week after today's: the student reaches it with one "Próxima semana".
  const week = addDays(monday(todayInSaoPaulo()), 7);
  const exam = week;
  const holiday = addDays(week, 2);
  const absence = addDays(week, 4);

  test("031/SC-008 o professor marca Prova, Feriado e Falta e salva", async ({ page }) => {
    test.setTimeout(120_000);
    const teacher = classTeacher();
    subjectName = `Calendário E2E ${unique()}`;
    // The student of the run's turma, enrolled before the teacher signs in (each in its own context).
    student = await createEnrolledStudent(page, "aluno-calendario", "Aluna Calendário E2E");
    await logIn(page, teacher, "/disciplinas");
    await createSubject(page, subjectName);
    // The period starts on the first day of today's month, so the calendar opens on it.
    const startsOn = `${monthOf(todayInSaoPaulo())}-01`;
    classId = await addClassThroughForm(page, teacher.cohortName, teacher.cohortName, subjectName, {
      startsOn,
      endsOn: addDays(startsOn, 120),
    });

    await page.goto(`/turmas/${classId}/calendario`);
    let shown = monthOf(startsOn);
    for (const [date, kind, texts] of [
      [exam, "Prova", { Descrição: "P1 — Herança" }],
      [holiday, "Feriado", { Descrição: "Feriado E2E" }],
      [absence, "Falta do professor", { "Motivo (só você vê)": REASON, "Aviso para a turma (opcional)": NOTICE }],
    ] as const) {
      while (shown < monthOf(date)) {
        await page.getByRole("button", { name: "Próximo mês" }).click();
        shown = monthOf(addDays(`${shown}-28`, 7));
      }
      await markDay(page, date, kind, texts);
    }
    await expect(page.getByText("Total de aulas selecionadas: 1")).toBeVisible();
    await expect(page.getByText("Outros dias marcados: 2")).toBeVisible();
    await page.getByRole("button", { name: "Salvar calendário" }).click();
    await expect(page.getByText("Calendário salvo.")).toBeVisible();
    // The teacher's own list shows the reason; the student's never will.
    await expect(page.getByRole("region", { name: "Dias sem aula" })).toContainText(REASON);
  });

  for (const theme of ["DARK", "LIGHT"] as const) {
    test(`031/SC-008 o aluno vê os tipos e o aviso, nunca o motivo, em 360 px, tema ${theme === "DARK" ? "escuro" : "claro"}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage();
      await logIn(page, student, "/painel");
      await setTheme(page, theme);
      await page.goto(`/painel?materia=${classId}`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "DARK" ? "dark" : "light");

      const card = page.getByRole("region", { name: "Seu calendário de aulas" });
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: "Próxima semana" }).click();
      const detail = card.locator("[aria-live=polite]");

      await card.getByRole("button", { name: /: Prova$/ }).click();
      await expect(detail).toContainText("P1 — Herança");
      await card.getByRole("button", { name: /: Feriado$/ }).click();
      await expect(detail).toContainText("Feriado E2E");
      await card.getByRole("button", { name: /: Falta do professor$/ }).click();
      await expect(detail).toContainText("Falta do professor");
      await expect(detail).toContainText(NOTICE);
      await expect(detail).toContainText(`${subjectName} · Prof.`);

      expect(await page.content()).not.toContain(REASON);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await setTheme(page, "DARK");
      await context.close();
    });
  }
});
