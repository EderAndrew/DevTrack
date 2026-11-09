import { expect, type Page, test } from "@playwright/test";
import { API_URL } from "./env.ts";
import { unique } from "./fixtures/curriculum.ts";
import { confirmedSyllabus } from "./fixtures/exams.ts";
import { type Account, acceptClassInvitation, logIn, newAccount } from "./fixtures/journeys.ts";
import { apiPost, markAllPresentThroughApi, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** 025/SC-001: the student sees the warning within 10 s of the send (the 5 s poll). */
const WITHIN_10_S = { timeout: 10_000 };
/** Occurrences of one action within 2 s count once (018/FR-016): the next one waits longer. */
const BETWEEN_OCCURRENCES_MS = 2_500;
const NUDGE_TEXT = "o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.";

/** Leaving the tab, as the browser reports it (as in exam.spec.ts): `visibilityState` flipped and dispatched. */
async function leaveAndReturn(page: Page): Promise<void> {
  for (const state of ["hidden", "visible"] as const) {
    await page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  }
}

/** One occurrence and "Voltar à prova" on its "Aviso n de 3". */
async function warned(page: Page, n: number): Promise<void> {
  await leaveAndReturn(page);
  const warning = page.getByRole("alertdialog", { name: `Aviso ${n} de 3` });
  await expect(warning).toBeVisible(WITHIN_10_S);
  await warning.getByRole("button", { name: "Voltar à prova" }).click();
  await expect(warning).toBeHidden();
  await page.waitForTimeout(BETWEEN_OCCURRENCES_MS);
}

/** The occurrences the server counted for the page's student. */
async function occurrenceCount(page: Page, activityId: string): Promise<number> {
  const res = await page.request.get(`/api/me/activities/${activityId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { exam: { occurrences: { count: number } } }).exam.occurrences.count;
}

/**
 * 025 — the teacher's discreet warning on the real exam page: the teacher applies an exam, two present students
 * start; A leaves the screen twice; the warning is sent through the API with the teacher's app bearer (the app
 * itself has its own Jest suite); only A sees "Mensagem do professor" within 10 s, B sees nothing in 15 s; A closes
 * it and it does not come back after a reload; the warning adds no "Aviso n de 3" and no occurrence.
 */
test.describe("025 aviso discreto do professor na prova", () => {
  let seed: StudentPortalSeed;
  let studentB: Account;
  let examId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    seed = await seedStudentPortal(browser);
    studentB = newAccount("aviso-aluno-b", `Aluna B ${unique()}`);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await apiPost(teacherPage, `/classes/${seed.classId}/invitations`, { email: studentB.email });
    const { revisionId, itemIds } = await confirmedSyllabus(teacherPage, seed.subjectId, ["Herança"]);
    const exam = await apiPost<{ id: string; version: number }>(teacherPage, "/exams", {
      subjectId: seed.subjectId,
      syllabusRevisionId: revisionId,
      title: `Prova com aviso ${unique()}`,
      totalGrade: "1.00",
      saveAs: "DRAFT",
      topicIds: [itemIds[0]],
      questions: [
        {
          type: "MULTIPLE_CHOICE",
          statement: "Qual palavra declara herança em Java?",
          alternatives: [
            { text: "extends", isCorrect: true },
            { text: "implements", isCorrect: false },
            { text: "inherits", isCorrect: false },
          ],
          isTrickQuestion: false,
          difficulty: "BASIC",
          topicIds: [itemIds[0]],
        },
      ],
    });
    await apiPost(teacherPage, `/exams/${exam.id}/approve`, { version: exam.version });
    examId = exam.id;
    await teacherPage.context().close();
    const page = await (await browser.newContext()).newPage();
    await acceptClassInvitation(page, studentB);
    await page.context().close();
  });

  test("025/SC-001 025/SC-002 só o aluno escolhido vê a mensagem em até 10 s, fecha e ela não volta", async ({ browser, playwright }) => {
    test.setTimeout(240_000);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    const activity = await apiPost<{ id: string }>(teacherPage, `/classes/${seed.classId}/activities`, {
      idempotencyKey: crypto.randomUUID(),
      source: { type: "EXAM", examId },
      title: "Prova com aviso",
      instructions: "Leia as regras.",
      publishAt: null,
      durationMinutes: 20,
      acknowledgeOutOfScope: true,
    });
    await markAllPresentThroughApi(teacherPage, seed.classId, activity.id);

    // Both students start on the exam page.
    const pageA = await (await browser.newContext()).newPage();
    const pageB = await (await browser.newContext()).newPage();
    for (const [page, account] of [
      [pageA, seed.student],
      [pageB, studentB],
    ] as const) {
      await logIn(page, account, `/minhas-atividades/${activity.id}`);
      await page.getByRole("button", { name: "Li as regras e quero iniciar" }).click();
      await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
    }

    // A leaves the screen twice: "Aviso 1 de 3" and "Aviso 2 de 3".
    await pageA.waitForTimeout(BETWEEN_OCCURRENCES_MS);
    for (const n of [1, 2]) await warned(pageA, n);
    expect(await occurrenceCount(pageA, activity.id)).toBe(2);

    // The app's bell: the teacher's MOBILE session (bearer, no Origin) sends the warning to A's attempt.
    const app = await playwright.request.newContext({ baseURL: API_URL });
    const login = await app.post("/api/auth/mobile/sessions", { data: { email: seed.teacher.email, password: seed.teacher.password } });
    expect(login.status(), await login.text()).toBe(201);
    const bearer = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` };
    const monitor = await app.get(`/api/classes/${seed.classId}/activities/${activity.id}/exam-monitor`, { headers: bearer });
    const rows = ((await monitor.json()) as { students: { name: string; attemptId: string | null; nudge: { canSend: boolean } | null }[] }).students;
    const rowA = rows.find((row) => row.name === seed.student.name)!;
    expect(rowA.nudge?.canSend).toBe(true);
    const sent = await app.post(`/api/classes/${seed.classId}/activities/${activity.id}/attempts/${rowA.attemptId}/exam-nudges`, { headers: bearer, data: {} });
    expect(sent.status(), await sent.text()).toBe(201);

    // 025/SC-001: A sees it within 10 s, with A's name; 025/SC-002: B sees nothing in 15 s.
    const message = pageA.getByRole("alertdialog", { name: "Mensagem do professor" });
    await expect(message).toBeVisible(WITHIN_10_S);
    await expect(message).toContainText(`${seed.student.name}, ${NUDGE_TEXT}`);
    await expect(pageA.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
    await pageB.waitForTimeout(15_000);
    await expect(pageB.getByRole("alertdialog")).toHaveCount(0);

    // A closes it: gone at once, the exam goes on, no new warning or occurrence.
    await message.getByRole("button", { name: "Entendi" }).click();
    await expect(message).toBeHidden();
    await expect(pageA.getByRole("radio").first()).toBeEnabled();
    await expect.poll(async () => (await (await pageA.request.get(`/api/me/activities/${activity.id}/attempt/exam-nudge`)).json()) as unknown, WITHIN_10_S).toEqual({ nudge: null });
    expect(await occurrenceCount(pageA, activity.id)).toBe(2);
    await expect(pageA.getByRole("alertdialog", { name: "Aviso 3 de 3" })).toHaveCount(0);

    // After a reload it does not come back.
    await pageA.reload();
    await pageA.waitForTimeout(10_000);
    await expect(pageA.getByRole("alertdialog", { name: "Mensagem do professor" })).toHaveCount(0);

    await app.dispose();
    for (const page of [teacherPage, pageA, pageB]) await page.context().close();
  });
});
