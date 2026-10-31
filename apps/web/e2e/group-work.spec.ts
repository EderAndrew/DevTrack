import { type Browser, expect, type Page, test } from "@playwright/test";
import { WEB_URL } from "./env.ts";
import { unique } from "./fixtures/curriculum.ts";
import { type Account, field, logIn, newAccount, raFor } from "./fixtures/journeys.ts";
import { waitForLink } from "./fixtures/mailpit.ts";
import { apiPost, seedStudentPortal, type StudentPortalSeed } from "./support/student-portal-seed.ts";

/** 023/US3-4: what the editor saves reaches the others within 10 s, through the 5 s polling, never a reload. */
const WITHIN_10_S = { timeout: 10_000 };
const answerBox = (page: Page) => page.getByLabel("Sua resposta");
const goToQuestion = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Questão ${n}\\b`) }).click();
const localInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Students of the class through its invitations (003 FR-048), each with the e-mail's token, all through the API. */
async function enroll(browser: Browser, teacherPage: Page, classId: string, accounts: Account[]): Promise<void> {
  for (const account of accounts) await apiPost(teacherPage, `/classes/${classId}/invitations`, { email: account.email });
  const context = await browser.newContext();
  for (const account of accounts) {
    const token = new URL(await waitForLink(account.email, { path: "/convite-turma", timeoutMs: 60_000 })).searchParams.get("token")!;
    const res = await context.request.post("/api/class-invitations/accept", {
      data: { token, name: account.name, ra: raFor(account), password: account.password },
      headers: { Origin: WEB_URL },
    });
    expect(res.status(), `${account.email}: ${await res.text()}`).toBeLessThan(300);
  }
  await context.close();
}

/**
 * 023 — the group work on the real screens, the teacher and three students in separate contexts (quickstart
 * steps 1–9): the teacher applies "Em grupo", the leader forms the group from "Iniciar" in under a minute
 * (023/SC-001), a member reads the save within 10 s, the editing goes and comes back, a late save is refused,
 * a classmate left out starts alone, the leader adds another and submits for the group, and the released grade
 * is the same for every member.
 */
test.describe("023 trabalho em grupo", () => {
  let seed: StudentPortalSeed;
  let bruno: Account;
  let carla: Account;
  let davi: Account;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    seed = await seedStudentPortal(browser);
    const suffix = unique();
    bruno = newAccount("grupo-bruno", `Bruno do Grupo ${suffix}`);
    carla = newAccount("grupo-carla", `Carla Sozinha ${suffix}`);
    davi = newAccount("grupo-davi", `Davi do Grupo ${suffix}`);
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, "/disciplinas");
    await enroll(browser, teacherPage, seed.classId, [bruno, carla, davi]);
    await teacherPage.context().close();
  });

  test("023/SC-001 aplicar em grupo, formar, passar e retomar, incluir, entregar pelo líder e a mesma nota", async ({ browser }) => {
    test.setTimeout(300_000);
    const ana = seed.student;

    // 1. The teacher applies the work "Em grupo", up to 3, and releases to everyone present.
    const teacherPage = await (await browser.newContext()).newPage();
    await logIn(teacherPage, seed.teacher, `/turmas/${seed.classId}/atividades/nova`);
    await teacherPage.getByRole("radio", { name: "Trabalho", exact: true }).check();
    await teacherPage.getByRole("radio", { name: new RegExp(seed.workTitle) }).check();
    await teacherPage.getByRole("button", { name: "Continuar" }).click();
    await expect(field(teacherPage, "Título")).toHaveValue(seed.workTitle);
    await field(teacherPage, "Prazo de entrega").fill(localInput(new Date(Date.now() + 7 * 24 * 3_600_000)));
    await teacherPage.getByRole("radio", { name: "Em grupo" }).check();
    await field(teacherPage, "Máximo de integrantes, com o líder").selectOption("3");
    await teacherPage.getByRole("button", { name: "Publicar atividade" }).click();
    await expect(teacherPage).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
    const activityPath = new URL(teacherPage.url()).pathname;
    const activityId = activityPath.split("/").at(-1)!;
    await teacherPage.getByRole("tab", { name: "Chamada e alunos" }).click();
    const attendance = teacherPage.getByRole("region", { name: "Chamada", exact: true });
    await attendance.getByRole("button", { name: "Marcar todos", exact: true }).click();
    await attendance.getByRole("button", { name: "Liberar para os presentes" }).click();
    await teacherPage.getByRole("alertdialog").getByRole("button", { name: "Liberar" }).click();
    await expect(attendance.getByText("4 de 4 presentes")).toBeVisible();

    const studentPath = `/minhas-atividades/${activityId}`;
    const anaPage = await (await browser.newContext()).newPage();
    const brunoPage = await (await browser.newContext()).newPage();
    const carlaPage = await (await browser.newContext()).newPage();
    const daviPage = await (await browser.newContext()).newPage();
    await logIn(anaPage, ana, studentPath);
    await logIn(brunoPage, bruno, "/painel");

    // 2. 023/SC-001: from "Iniciar" to the questions of a group, in under a minute.
    const formingStart = Date.now();
    await anaPage.getByRole("button", { name: "Iniciar atividade" }).click();
    const dialog = anaPage.getByRole("dialog", { name: "Trabalho em grupo" });
    await expect(dialog.getByText("Você pode incluir até 2.", { exact: false })).toBeVisible();
    await dialog.getByRole("checkbox", { name: bruno.name }).check();
    await dialog.getByRole("button", { name: "Iniciar em grupo" }).click();
    await expect(anaPage.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    expect(Date.now() - formingStart).toBeLessThan(60_000);
    const editingNow = (page: Page) => page.getByRole("status", { name: "Editando agora" });
    await expect(editingNow(anaPage)).toContainText(ana.name);

    // 3. Bruno finds the group: read-only, no "Iniciar", and Ana's save within 10 s without a reload.
    await brunoPage.goto(studentPath);
    await expect(brunoPage.getByText(`Você está no grupo de ${ana.name} neste trabalho.`)).toBeVisible();
    await expect(brunoPage.getByRole("button", { name: "Iniciar atividade" })).toHaveCount(0);
    await anaPage.getByRole("radio", { name: /extends/ }).check();
    await expect(anaPage.getByText("Resposta salva", { exact: true }).first()).toBeVisible();
    await expect(brunoPage.getByRole("radio", { name: /extends/ })).toBeChecked(WITHIN_10_S);
    await expect(brunoPage.getByText(`Salvo por ${ana.name}.`)).toBeVisible(WITHIN_10_S);

    // 4. The editing goes to Bruno, who saves; Ana takes it back, and Bruno's screen turns read-only.
    await anaPage.getByRole("button", { name: "Passar a edição" }).click();
    await anaPage.getByRole("menuitem", { name: bruno.name }).click();
    await expect(editingNow(anaPage)).toContainText(bruno.name);
    await goToQuestion(brunoPage, 2);
    await expect(answerBox(brunoPage)).toBeEnabled(WITHIN_10_S);
    await answerBox(brunoPage).fill("Esconder o estado atrás de métodos.");
    await expect(brunoPage.getByText("Resposta salva", { exact: true }).first()).toBeVisible();
    await anaPage.getByRole("button", { name: "Retomar a edição" }).click();
    await expect(editingNow(anaPage)).toContainText(ana.name);
    await expect(answerBox(brunoPage)).toBeDisabled(WITHIN_10_S);

    // 5. Carla sees only Davi and goes alone; Ana adds Davi and the group is full.
    await logIn(carlaPage, carla, studentPath);
    await carlaPage.getByRole("button", { name: "Iniciar atividade" }).click();
    const carlaDialog = carlaPage.getByRole("dialog", { name: "Trabalho em grupo" });
    await expect(carlaDialog.getByRole("checkbox", { name: davi.name })).toBeVisible();
    await expect(carlaDialog.getByRole("checkbox")).toHaveCount(1);
    await carlaDialog.getByRole("button", { name: "Continuar sozinho" }).click();
    await expect(carlaPage.getByRole("heading", { name: /^Questão 1/ })).toBeVisible();
    await carlaPage.getByRole("radio", { name: /extends/ }).check();
    await expect(carlaPage.getByText("Resposta salva", { exact: true }).first()).toBeVisible();

    await anaPage.getByRole("button", { name: "Incluir integrantes" }).click();
    const addDialog = anaPage.getByRole("dialog", { name: "Incluir integrantes" });
    await addDialog.getByRole("checkbox", { name: davi.name }).check();
    await addDialog.getByRole("button", { name: "Incluir", exact: true }).click();
    await expect(anaPage.getByRole("button", { name: "Incluir integrantes" })).toHaveCount(0);
    await logIn(daviPage, davi, studentPath);
    await expect(daviPage.getByText(`Você está no grupo de ${ana.name} neste trabalho.`)).toBeVisible();

    // 8. Only the leader submits, for the group; a member never had the button.
    await expect(brunoPage.getByRole("button", { name: "Entregar atividade" })).toHaveCount(0);
    await anaPage.getByRole("button", { name: "Entregar atividade" }).click();
    await anaPage.getByRole("alertdialog", { name: "Entregar atividade?" }).getByRole("button", { name: "Entregar", exact: true }).click();
    await expect(anaPage.getByText(/^Atividade entregue em /)).toBeVisible();
    await carlaPage.getByRole("button", { name: "Entregar atividade" }).click();
    await carlaPage.getByRole("alertdialog", { name: "Entregar atividade?" }).getByRole("button", { name: "Entregar", exact: true }).click();
    await expect(carlaPage.getByText(/^Atividade entregue em /)).toBeVisible();

    // 9. One line for the group and one for Carla; the facts; the grade and the release.
    await teacherPage.goto(`${activityPath}?aba=alunos`);
    const groupLink = teacherPage.getByRole("link", { name: new RegExp(`${ana.name} e mais 2`) });
    await expect(groupLink).toBeVisible();
    await expect(teacherPage.getByRole("link", { name: new RegExp(carla.name) })).toBeVisible();
    await groupLink.click();
    await expect(teacherPage.getByRole("list", { name: "Integrantes" })).toContainText(davi.name);
    await expect(teacherPage.getByText(new RegExp(`Salvo por ${bruno.name}`)).first()).toBeVisible();
    await field(teacherPage, "Nota da questão 2").fill("0,20");
    await field(teacherPage, "Nota da questão 4").fill("0,10");
    await teacherPage.getByRole("button", { name: "Salvar correção" }).click();
    await expect(teacherPage.getByText("Correção salva.")).toBeVisible();

    await teacherPage.goto(`${activityPath}?aba=alunos`);
    await teacherPage.getByRole("link", { name: new RegExp(carla.name) }).click();
    await field(teacherPage, "Nota da questão 2").fill("0,00");
    await field(teacherPage, "Nota da questão 4").fill("0,00");
    await teacherPage.getByRole("button", { name: "Salvar correção" }).click();
    await expect(teacherPage.getByText("Correção salva.")).toBeVisible();

    await teacherPage.goto(activityPath);
    await teacherPage.getByRole("button", { name: "Liberar resultado" }).click();
    await teacherPage.getByRole("alertdialog").getByRole("button", { name: "Liberar resultado" }).click();
    await expect(teacherPage.getByText("Resultado liberado.")).toBeVisible();

    for (const page of [anaPage, brunoPage, daviPage]) {
      await page.goto(studentPath);
      await expect(page.getByRole("region", { name: "Resultado" }).getByText("0,50 de 1,00")).toBeVisible();
    }
    await carlaPage.goto(studentPath);
    await expect(carlaPage.getByRole("region", { name: "Resultado" }).getByText("0,20 de 1,00")).toBeVisible();

    for (const page of [teacherPage, anaPage, brunoPage, carlaPage, daviPage]) await page.context().close();
  });
});
