import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  createSubject,
  sendSyllabus,
  syllabusFile,
  unique,
  upload,
} from "./fixtures/curriculum.ts";
import {
  bootstrapAdmin,
  classTeacher,
  field,
  logIn,
} from "./fixtures/journeys.ts";
import { API_DIR } from "./env.ts";

/**
 * The work generator's answer the OpenRouter mock replays (e2e/openrouter-mock.ts): 2 open answers
 * and 2 multiple choice on 2 topics, Básico, 1 trick question.
 */
const RECORDED = JSON.parse(
  readFileSync(
    join(
      API_DIR,
      "test/fixtures/work-generation/golden/sql-joins-sem-linguagem/recorded.json",
    ),
    "utf8",
  ),
) as { steps: ({ output: { questions: { statement: string }[] } } | object)[] };
const GENERATED = RECORDED.steps.flatMap((step) =>
  "output" in step ? step.output.questions : [],
);
const TOPICS = [
  "Junções entre tabelas: INNER JOIN, LEFT JOIN e RIGHT JOIN",
  "Subconsultas",
];

const question = (page: Page, n: number) =>
  page.getByRole("group", { name: `Questão ${n}` });

/** The student view opened by "Ver como aluno": the section named by the work's title. */
const studentView = (page: Page, title: string) =>
  page.getByRole("region", { name: title });

/**
 * The generator is registered disabled (011/FR-030): the ADMIN enables it in "Operação de IA" after
 * the release gate. Idempotent, since other runs or retries may have enabled it already.
 */
async function enableWorkGenerator(page: Page): Promise<void> {
  await logIn(page, bootstrapAdmin(), "/admin/ia?aba=agentes");
  const agents = page.getByRole("region", { name: "Agentes" });
  await expect(agents.getByText("Gerador de trabalhos")).toBeVisible();
  const enable = agents.getByRole("button", {
    name: "Habilitar o agente Gerador de trabalhos",
  });
  if (await enable.isVisible()) {
    await enable.click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Habilitar" })
      .click();
  }
  await expect(
    agents.getByRole("button", {
      name: "Desabilitar o agente Gerador de trabalhos",
    }),
  ).toBeVisible();
  await page.context().clearCookies();
}

/** A subject whose syllabus (an uploaded image, filled in by hand) is confirmed with `items` in one group. */
async function subjectWithConfirmedSyllabus(
  page: Page,
  name: string,
  items: string[],
): Promise<void> {
  await createSubject(page, name);
  await sendSyllabus(page, upload("ementa.png", syllabusFile("ementa.png")));
  await page.getByRole("link", { name: "ementa.png" }).click();
  await page
    .getByRole("button", { name: "Preencher manualmente" })
    .first()
    .click({ timeout: 30_000 });
  const syllabus = page.getByRole("form", { name: "Revisão 1 do conteúdo" });
  await syllabus.getByRole("button", { name: "Adicionar grupo" }).click();
  await field(syllabus, "Título do grupo").fill("Consultas");
  for (const [index, text] of items.entries()) {
    const item = syllabus.getByRole("textbox", {
      name: `Item ${index + 1} do grupo 1`,
      exact: true,
    });
    if ((await item.count()) === 0)
      await syllabus
        .getByRole("button", { name: "Adicionar item ao grupo 1" })
        .click();
    await item.fill(text);
  }
  await syllabus.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar conteúdo" })
    .click();
  await expect(
    page.getByText(/Conteúdo confirmado — revisão 1\./),
  ).toBeVisible();
}

async function fillCommon(scope: Locator, type: string, statement: string) {
  await scope.getByLabel(/^Tipo/).selectOption({ label: type });
  await scope.getByLabel(/^Enunciado/).fill(statement);
}

// 011/SC-001: a manual work with one question of each type, total 0,50 split into 0,17 · 0,17 · 0,16,
// without any AI call; "Ver como aluno" shows the values and none of the answer key.
test("011/SC-001 011/US1-1 011/US2-1 011/US6-1 trabalho manual com os três tipos e nota 0,50 → 0,17 · 0,17 · 0,16, aprovado e visto como aluno sem gabarito", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const started = Date.now();
  const tag = unique();
  const subjectName = `POO ${tag}`;
  const title = `Trabalho de herança ${tag}`;
  await logIn(page, classTeacher(), "/disciplinas");
  await createSubject(page, subjectName);

  await page.goto("/trabalhos");
  await page.getByRole("link", { name: "Criar trabalho manualmente" }).click();
  await expect(page).toHaveURL(/\/trabalhos\/novo$/);
  // Right after the client navigation the form can still be replaced, losing a subject chosen too
  // early: choose until the form keeps it (the "Ementa" select only enables once the form has it).
  await page.waitForLoadState("networkidle");
  await expect(async () => {
    await field(page, "Disciplina").selectOption({ label: subjectName });
    await page.waitForTimeout(500);
    await expect(
      page.getByRole("combobox", { name: "Ementa", exact: true }),
    ).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await field(page, "Título").fill(title);
  await field(page, "Nota total").fill("0,50");
  await page.getByRole("button", { name: "Adicionar questão" }).click();
  await page.getByRole("button", { name: "Adicionar questão" }).click();

  const first = question(page, 1);
  await fillCommon(first, "Pergunta e resposta", "O que é herança?");
  await first
    .getByLabel(/^Resposta esperada/)
    .fill("RESPOSTA-SECRETA reuso por extensão de uma classe.");

  const second = question(page, 2);
  await fillCommon(
    second,
    "Múltipla escolha",
    "Qual palavra estende uma classe em Java?",
  );
  for (const [index, text] of ["extends", "implements", "inherits"].entries())
    await second.getByLabel(new RegExp(`^Alternativa ${index + 1}`)).fill(text);
  await second.getByRole("radio", { name: "Correta (alternativa 1)" }).check();

  const third = question(page, 3);
  await fillCommon(third, "Código", "Declare Cachorro como subclasse de Animal.");
  await third
    .getByLabel(/^Solução esperada/)
    .fill("class SOLUCAO_SECRETA extends Animal {}");
  await third.getByLabel(/^Linguagem/).selectOption({ label: "Java" });
  await third.getByRole("button", { name: "Adicionar caso de teste" }).click();
  await third.getByLabel(/^Entrada do caso 1/).fill("latir");
  await third.getByLabel(/^Saída esperada do caso 1/).fill("au");

  await expect(
    page.getByText(/^Vale /).filter({ visible: true }),
  ).toHaveText(["Vale 0,17", "Vale 0,17", "Vale 0,16"]);
  await page.getByRole("button", { name: "Salvar e aprovar" }).click();
  await expect(page).toHaveURL(/\/trabalhos\?criado=1$/);
  await expect(page.getByText("Trabalho salvo.")).toBeVisible();

  await field(page, "Pesquisar no título").fill(tag);
  await page.getByRole("button", { name: "Pesquisar" }).click();
  const row = page
    .getByRole("table", { name: "Seus trabalhos" })
    .getByRole("row", { name: new RegExp(title) });
  await expect(row.getByText("3 questões · nota 0,50")).toBeVisible();
  await expect(row.getByText("Aprovado")).toBeVisible();
  await row.getByRole("link", { name: title }).click();

  await page.getByRole("button", { name: "Ver como aluno" }).click();
  const view = studentView(page, title);
  await expect(view.getByText("Visão do aluno (somente leitura)")).toBeVisible();
  await expect(view.getByText("Nota total: 0,50")).toBeVisible();
  await expect(view.getByText(/ · Vale /)).toHaveText([
    "Pergunta e resposta · Vale 0,17",
    "Múltipla escolha · Vale 0,17",
    "Código · Vale 0,16",
  ]);
  await expect(view.getByText("Entrada: latir · Saída esperada: au")).toBeVisible();
  // No answer key: the expected answer, the solution and which alternative is correct stay out.
  await expect(view).not.toContainText("RESPOSTA-SECRETA");
  await expect(view).not.toContainText("SOLUCAO_SECRETA");
  await expect(view).not.toContainText(/correta/i);
  expect(Date.now() - started).toBeLessThan(300_000);
});

// 011/US3, 011/US5: "Criar trabalho com IA" on two topics of a confirmed syllabus, through the real
// OpenRouter adapter talking to the local mock; the DRAFT work is reviewed, approved and seen as a student.
test("011/US3-1 011/US5-1 Criar trabalho com IA a partir de dois tópicos → rascunho → aprovar → no banco como gerado por IA", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await enableWorkGenerator(page);

  const tag = unique();
  const subjectName = `Banco de Dados ${tag}`;
  const title = `Trabalho de consultas SQL ${tag}`;
  await logIn(page, classTeacher(), "/disciplinas");
  await subjectWithConfirmedSyllabus(page, subjectName, [
    ...TOPICS,
    "Agregação com GROUP BY",
  ]);

  await page.goto("/trabalhos/gerar");
  const form = page.getByRole("form", { name: "Criar trabalho com IA" });
  await form.getByLabel(/^Disciplina/).selectOption({ label: subjectName });
  await form.getByLabel(/^Ementa/).selectOption({ index: 1 });
  const topics = form.getByRole("group", { name: "Tópicos do trabalho" });
  for (const topic of TOPICS)
    await topics.getByLabel(topic, { exact: true }).check();
  await form.getByLabel(/^Título/).fill(title);
  await form.getByLabel(/^Dificuldade/).selectOption({ label: "Básico" });
  await form.getByLabel(/^Nota total/).fill("1,00");
  await form.getByLabel(/^Quantidade de questões/).selectOption("4");
  await expect(
    form.getByText("Serão geradas: Pergunta e resposta 2 · Múltipla escolha 2."),
  ).toBeVisible();
  await form.getByLabel(/^Pegadinhas/).selectOption("1");
  await form.getByRole("button", { name: "Gerar trabalho" }).click();

  // The request: the worker runs the generation and the page follows it to the DRAFT work.
  await expect(page).toHaveURL(/\/trabalhos\/pedidos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Gerado", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("link", { name: "Abrir trabalho" }).click();
  await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
  await expect(page.getByText("Gerado por IA")).toBeVisible();
  await expect(
    page.getByLabel(/^Enunciado/).first(),
  ).toHaveValue(GENERATED[0]!.statement);

  await page.getByRole("button", { name: "Aprovar", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Aprovar este trabalho?" })
    .getByRole("button", { name: "Aprovar trabalho" })
    .click();
  await expect(page.getByText("Trabalho aprovado.")).toBeVisible();
  await expect(page.getByText(/Revisado por /)).toBeVisible();

  await page.getByRole("button", { name: "Ver como aluno" }).click();
  const view = studentView(page, title);
  await expect(view.getByText(/ · Vale /)).toHaveCount(4);
  await expect(view.getByText(GENERATED[0]!.statement)).toBeVisible();
  await expect(view).not.toContainText(/pegadinha/i);

  // In the bank: approved, generated by AI, found by its title.
  await page.goto("/trabalhos");
  await field(page, "Pesquisar no título").fill(tag);
  await page.getByRole("button", { name: "Pesquisar" }).click();
  const row = page
    .getByRole("table", { name: "Seus trabalhos" })
    .getByRole("row", { name: new RegExp(title) });
  await expect(row.getByText("Gerado por IA")).toBeVisible();
  await expect(row.getByText("Aprovado")).toBeVisible();
  await expect(row.getByText("4 questões · nota 1,00")).toBeVisible();
});
