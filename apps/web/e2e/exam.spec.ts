import { devices, expect, type Locator, type Page, test } from "@playwright/test";
import { sendSyllabus, syllabusFile, unique, upload } from "./fixtures/curriculum.ts";
import { type Account, acceptClassInvitation, field, logIn, newAccount } from "./fixtures/journeys.ts";
import { apiPost, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** 018/SC-007: what one side does shows on the other within 10 s, through the 5 s polling, never a reload. */
const WITHIN_10_S = { timeout: 10_000 };
/** The shortest exam that leaves time for the warnings, the hold, the return and a second hold. */
const DURATION_MINUTES = 2;
/** Occurrences of one action within 2 s count once (018/FR-016): the next one waits longer. */
const BETWEEN_OCCURRENCES_MS = 2_500;

/** Presses Tab until `target` has the focus (keyboard only, 018/SC-011). */
async function tabTo(page: Page, target: Locator, max = 200): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab não chegou a ${target}`);
}

/** Tab to `target` and press Enter. */
async function press(page: Page, target: Locator): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

/**
 * Leaving the tab, as the browser reports it: headless Chromium never hides a page by itself, so the
 * page's `visibilityState` is flipped and `visibilitychange` dispatched (as in controlled-work.spec.ts).
 */
async function leaveAndReturn(page: Page): Promise<void> {
  for (const state of ["hidden", "visible"] as const) {
    await page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  }
}

/** One occurrence, then "Voltar à prova" by keyboard on its warning, "Aviso n de 3". */
async function warned(page: Page, n: number): Promise<void> {
  await leaveAndReturn(page);
  const warning = page.getByRole("alertdialog", { name: `Aviso ${n} de 3` });
  await expect(warning).toBeVisible(WITHIN_10_S);
  await expect(warning.getByText("Você saiu da tela da prova. Na 4ª ocorrência a prova será encerrada.")).toBeVisible();
  await expect(warning.getByRole("button", { name: "Voltar à prova" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(warning).toBeHidden();
  await page.waitForTimeout(BETWEEN_OCCURRENCES_MS);
}

/** The syllabus of the seed's subject (an image, filled in by hand) confirmed with one group; returns the revision and its item ids. */
async function confirmedSyllabus(page: Page, subjectId: string, items: string[]): Promise<{ revisionId: string; itemIds: string[] }> {
  await page.goto(`/disciplinas/${subjectId}`);
  await sendSyllabus(page, upload("ementa.png", syllabusFile("ementa.png")));
  await page.getByRole("link", { name: "ementa.png" }).click();
  await page.getByRole("button", { name: "Preencher manualmente" }).first().click({ timeout: 30_000 });
  const syllabus = page.getByRole("form", { name: "Revisão 1 do conteúdo" });
  await syllabus.getByRole("button", { name: "Adicionar grupo" }).click();
  await field(syllabus, "Título do grupo").fill("Orientação a objetos");
  for (const [index, text] of items.entries()) {
    const item = syllabus.getByRole("textbox", { name: `Item ${index + 1} do grupo 1`, exact: true });
    if ((await item.count()) === 0) await syllabus.getByRole("button", { name: "Adicionar item ao grupo 1" }).click();
    await item.fill(text);
  }
  await syllabus.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar conteúdo" }).click();
  await expect(page.getByText(/Conteúdo confirmado — revisão 1\./)).toBeVisible();
  const documents = (await (await page.request.get(`/api/subjects/${subjectId}/syllabus-documents`)).json()) as { items: { confirmedRevision: { id: string } | null }[] };
  const revisionId = documents.items.find((document) => document.confirmedRevision)!.confirmedRevision!.id;
  const revision = (await (await page.request.get(`/api/syllabus-revisions/${revisionId}`)).json()) as { groups: { items: { id: string }[] }[] };
  return { revisionId, itemIds: revision.groups.flatMap((group) => group.items.map((item) => item.id)) };
}

/** The exam's two multiple-choice questions, 1,00 each: graded with no action of the teacher (018/SC-008). */
const QUESTIONS = [
  { statement: "Qual palavra declara herança em Java?", correct: "extends", wrong: ["implements", "inherits"] },
  { statement: "O que é um objeto?", correct: "Uma instância de uma classe", wrong: ["Um tipo primitivo", "Um pacote"] },
];

/**
 * 018 — the exam on the real screens, the teacher and two students in separate contexts: the teacher
 * approves the exam and applies it with a short duration; the attendance releases it (before it, no
 * student gets anything of it, 018/SC-001); student A gets warnings 1, 2 and 3 and the 4th holds the
 * exam (018/SC-004), which the teacher sees within 10 s and returns with one action (018/SC-007); a new
 * occurrence holds it again; student B, on a phone, lets the time run out; after the end the teacher
 * confirms A's cancellation and releases the result, and A reads it. Everything by keyboard
 * (018/SC-011).
 */
test.describe("018 prova em modo restrito com avisos e decisão do professor", () => {
  let seed: StudentPortalSeed;
  let studentB: Account;
  let examId: string;
  let examTitle: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    seed = await seedStudentPortal(browser);
    studentB = newAccount("prova-aluno-b", `Aluna B ${unique()}`);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await apiPost(teacherPage, `/classes/${seed.classId}/invitations`, { email: studentB.email });
    const { revisionId, itemIds } = await confirmedSyllabus(teacherPage, seed.subjectId, ["Herança", "Objetos"]);
    examTitle = `Prova de POO ${unique()}`;
    // The draft is written through the API (the bank form has its own suite, exam-form.test.tsx); the
    // approval is on the screen, by keyboard.
    const exam = await apiPost<{ id: string }>(teacherPage, "/exams", {
      subjectId: seed.subjectId,
      syllabusRevisionId: revisionId,
      title: examTitle,
      totalGrade: "2.00",
      saveAs: "DRAFT",
      topicIds: [itemIds[0]],
      questions: QUESTIONS.map((question) => ({
        type: "MULTIPLE_CHOICE",
        statement: question.statement,
        alternatives: [{ text: question.correct, isCorrect: true }, ...question.wrong.map((text) => ({ text, isCorrect: false }))],
        isTrickQuestion: false,
        difficulty: "BASIC",
        topicIds: [itemIds[0]],
      })),
    });
    examId = exam.id;
    await teacherPage.context().close();
    const page = await (await browser.newContext()).newPage();
    await acceptClassInvitation(page, studentB);
    await page.context().close();
  });

  test("018/SC-001 018/SC-004 018/SC-007 018/SC-011 aprovar, aplicar, chamada, avisos, retenção, devolução, tempo esgotado, cancelamento e liberação, só com o teclado", async ({
    browser,
  }) => {
    test.setTimeout(420_000);
    const teacherPage = await (await browser.newContext()).newPage();

    // 1. The teacher approves the draft on the bank's page, by keyboard.
    await logIn(teacherPage, seed.teacher, `/provas/${examId}`);
    await expect(teacherPage.getByText("Rascunho")).toBeVisible();
    await press(teacherPage, teacherPage.getByRole("button", { name: "Aprovar", exact: true }));
    const approve = teacherPage.getByRole("alertdialog", { name: "Aprovar esta prova?" });
    await tabTo(teacherPage, approve.getByRole("button", { name: "Aprovar prova" }), 5);
    await teacherPage.keyboard.press("Enter");
    await expect(teacherPage.getByText("Prova aprovada.")).toBeVisible();

    // 2. Applies it to the class by keyboard: "Prova", the exam, a short duration.
    await teacherPage.goto(`/turmas/${seed.classId}/atividades/nova`);
    const examType = teacherPage.getByRole("radio", { name: "Prova", exact: true });
    // A radio group is one Tab stop (the checked "Trabalho"); the arrows choose within it.
    await tabTo(teacherPage, teacherPage.getByRole("radio", { checked: true }).first());
    for (let i = 0; i < 5 && !(await examType.isChecked()); i++) await teacherPage.keyboard.press("ArrowDown");
    await expect(examType).toBeChecked();
    const examChoice = teacherPage.getByRole("radio", { name: new RegExp(examTitle) });
    await tabTo(teacherPage, examChoice);
    await teacherPage.keyboard.press("Space");
    await expect(examChoice).toBeChecked();
    await press(teacherPage, teacherPage.getByRole("button", { name: "Continuar" }));
    const form = teacherPage.getByRole("form", { name: "Dados da atividade" });
    await expect(form).toBeVisible();
    await tabTo(teacherPage, form.getByLabel(/^Duração/));
    await teacherPage.keyboard.press("ControlOrMeta+a");
    await teacherPage.keyboard.type(String(DURATION_MINUTES));
    const acknowledge = form.getByRole("checkbox", { name: "Entendo e quero aplicar mesmo assim" });
    if (await acknowledge.isVisible()) {
      await tabTo(teacherPage, acknowledge);
      await teacherPage.keyboard.press("Space");
    }
    await press(teacherPage, form.getByRole("button", { name: "Aplicar prova" }));
    await expect(teacherPage).toHaveURL(/\/turmas\/[0-9a-f-]{36}\/atividades\/[0-9a-f-]{36}/);
    const activityId = new URL(teacherPage.url()).pathname.split("/").at(-1)!;
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });
    await expect(attendance.getByText("Aguardando chamada")).toBeVisible();

    // 3. 018/SC-001: before the attendance no student gets anything of the exam, by any way.
    const pageA = await (await browser.newContext()).newPage();
    await logIn(pageA, seed.student, "/painel");
    await expect(pageA.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(pageA.getByRole("article", { name: examTitle })).toHaveCount(0);
    expect((await pageA.request.get(`/api/me/activities/${activityId}`)).status()).toBe(404);
    expect((await pageA.request.post(`/api/me/activities/${activityId}/attempt`, { data: { acceptRules: true }, headers: { Origin: new URL(teacherPage.url()).origin } })).status()).toBe(404);

    // 4. The attendance by keyboard: both present, released.
    await press(teacherPage, attendance.getByRole("button", { name: "Marcar todos", exact: true }));
    await press(teacherPage, attendance.getByRole("button", { name: "Liberar para os presentes" }));
    const release = teacherPage.getByRole("alertdialog");
    await tabTo(teacherPage, release.getByRole("button", { name: "Liberar", exact: true }), 5);
    await teacherPage.keyboard.press("Enter");
    const room = teacherPage.getByRole("list", { name: "Alunos na prova" });
    const rowA = room.getByRole("listitem").filter({ hasText: seed.student.name });
    const rowB = room.getByRole("listitem").filter({ hasText: studentB.name });
    await expect(rowA).toBeVisible(WITHIN_10_S);

    // 5. Student A reads the rules and starts by keyboard; answers question 1.
    await pageA.goto(`/minhas-atividades/${activityId}`);
    await expect(pageA.getByText("Regras da prova")).toBeVisible();
    await press(pageA, pageA.getByRole("button", { name: "Li as regras e quero iniciar" }));
    await expect(pageA.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
    await tabTo(pageA, pageA.getByRole("radio").first());
    await pageA.keyboard.press("Space");
    await expect(pageA.getByRole("radio", { name: /extends/ })).toBeChecked();

    // 6. Student B starts on a phone and answers question 1; the time will run out.
    const pageB = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
    await logIn(pageB, studentB, `/minhas-atividades/${activityId}`);
    await press(pageB, pageB.getByRole("button", { name: "Li as regras e quero iniciar" }));
    const timerB = pageB.getByRole("timer", { name: "Tempo restante" });
    await expect(timerB).toBeVisible();
    await tabTo(pageB, pageB.getByRole("radio").first());
    await pageB.keyboard.press("Space");
    expect(await pageB.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // 7. 018/SC-004: warnings 1, 2 and 3, then the 4th holds the exam: the questions leave A's screen.
    await pageA.waitForTimeout(BETWEEN_OCCURRENCES_MS);
    for (const n of [1, 2, 3]) await warned(pageA, n);
    await leaveAndReturn(pageA);
    await expect(pageA.getByText(/Prova encerrada por excesso de avisos/)).toBeVisible(WITHIN_10_S);
    await expect(pageA.getByRole("radio")).toHaveCount(0);

    // 8. 018/SC-007: the teacher sees A held within 10 s and returns the exam with one action.
    await expect(rowA.getByText("Encerrada por avisos — aguardando decisão")).toBeVisible(WITHIN_10_S);
    await press(teacherPage, rowA.getByRole("button", { name: `Devolver prova ${seed.student.name}` }));
    await expect(rowA.getByText(/^Respondendo/)).toBeVisible(WITHIN_10_S);
    await expect(pageA.getByText(/^O professor devolveu a sua prova\. Restam \d minutos?\.$/)).toBeVisible(WITHIN_10_S);
    await press(pageA, pageA.getByRole("button", { name: "Retomar", exact: true }));
    // The answer saved before the hold is still there.
    await expect(pageA.getByRole("radio", { name: /extends/ })).toBeChecked();

    // 9. A new occurrence after the return holds it again.
    await pageA.waitForTimeout(BETWEEN_OCCURRENCES_MS);
    await leaveAndReturn(pageA);
    await expect(pageA.getByText(/Prova encerrada por excesso de avisos/)).toBeVisible(WITHIN_10_S);
    await expect(rowA.getByText("Encerrada por avisos — aguardando decisão")).toBeVisible(WITHIN_10_S);

    // 10. B's time runs out: "Tempo esgotado" on the phone and in the teacher's room.
    await expect(pageB.getByText("Tempo esgotado. Suas respostas salvas foram registradas.")).toBeVisible({ timeout: (DURATION_MINUTES * 60 + 30) * 1_000 });
    await expect(timerB).toHaveCount(0);
    await expect(rowB.getByText("Tempo esgotado")).toBeVisible(WITHIN_10_S);

    // 11. After the end only "Confirmar cancelamento" and "Não cancelar" remain; the teacher confirms A's
    // cancellation by keyboard, then releases the result.
    await expect(rowA.getByRole("button", { name: `Devolver prova ${seed.student.name}` })).toHaveCount(0, { timeout: 15_000 });
    await press(teacherPage, rowA.getByRole("button", { name: `Confirmar cancelamento ${seed.student.name}` }));
    const cancel = teacherPage.getByRole("alertdialog", { name: `Cancelar a prova de ${seed.student.name}?` });
    await expect(cancel.getByText("A nota será zero. Esta decisão é registrada.")).toBeVisible();
    await tabTo(teacherPage, cancel.getByRole("button", { name: "Confirmar cancelamento" }), 5);
    await teacherPage.keyboard.press("Enter");
    await expect(rowA.getByText("Cancelada — nota zero")).toBeVisible(WITHIN_10_S);
    await press(teacherPage, teacherPage.getByRole("button", { name: "Liberar resultado" }));
    const confirmRelease = teacherPage.getByRole("alertdialog");
    await tabTo(teacherPage, confirmRelease.getByRole("button", { name: "Liberar resultado" }), 5);
    await teacherPage.keyboard.press("Enter");
    await expect(confirmRelease).toBeHidden();

    // 12. A reads the cancellation once the result is released (018/FR-029).
    await pageA.goto(`/minhas-atividades/${activityId}`);
    await expect(pageA.getByText("Prova cancelada pelo professor.")).toBeVisible(WITHIN_10_S);

    for (const page of [teacherPage, pageA, pageB]) await page.context().close();
  });
});
