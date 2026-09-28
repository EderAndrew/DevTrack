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

/** The generator's answer the OpenRouter mock replays (e2e/openrouter-mock.ts): 2 open answers and 2 multiple choice, Básico. */
const RECORDED = JSON.parse(
  readFileSync(
    join(
      API_DIR,
      "test/fixtures/exercise-generation/golden/sql-joins-sem-linguagem/recorded.json",
    ),
    "utf8",
  ),
) as { steps: ({ output: { exercises: { statement: string }[] } } | object)[] };
const GENERATED = RECORDED.steps.flatMap((step) =>
  "output" in step ? step.output.exercises : [],
);
const TOPIC = "Junções entre tabelas: INNER JOIN, LEFT JOIN e RIGHT JOIN";

const card = (page: Page, n: number) =>
  page.getByRole("group", { name: `Exercício ${n}` });

async function fillCommon(scope: Locator, statement: string) {
  await scope.getByLabel(/^Enunciado/).fill(statement);
  await scope.getByLabel(/^Dificuldade/).selectOption({ label: "Básico" });
  await scope
    .getByLabel(/^Objetivo cognitivo/)
    .selectOption({ label: "Compreender" });
  await scope.getByLabel(/^Explicação/).fill("Explicação da resposta.");
}

/**
 * The generator is registered disabled (010/FR-033): the ADMIN enables it in "Operação de IA" after
 * the release gate. Idempotent, since other runs or retries may have enabled it already.
 */
async function enableExerciseGenerator(page: Page): Promise<void> {
  await logIn(page, bootstrapAdmin(), "/admin/ia");
  const agents = page.getByRole("region", { name: "Agentes" });
  await expect(agents.getByText("Gerador de exercícios")).toBeVisible();
  const enable = agents.getByRole("button", {
    name: "Habilitar o agente Gerador de exercícios",
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
      name: "Desabilitar o agente Gerador de exercícios",
    }),
  ).toBeVisible();
  await page.context().clearCookies();
}

// 010/SC-001: three manual exercises, one of each type, in under 5 minutes and without any AI call.
test("010/SC-001 010/US1-1 conjunto manual com um exercício de cada tipo → salvo no banco e encontrado pela busca", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const started = Date.now();
  const tag = unique();
  await logIn(page, classTeacher(), "/exercicios");
  await page.getByRole("link", { name: "Criar manualmente" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Criar exercícios" }),
  ).toBeVisible();

  const first = card(page, 1);
  await fillCommon(first, `O que é herança? ${tag}`);
  await first
    .getByLabel(/^Resposta esperada/)
    .fill("Reuso por extensão de uma classe.");

  const second = card(page, 2);
  await second.getByLabel(/^Tipo/).selectOption({ label: "Múltipla escolha" });
  await fillCommon(second, `Qual palavra estende uma classe em Java? ${tag}`);
  for (const [index, text] of ["extends", "implements", "inherits"].entries())
    await second.getByLabel(new RegExp(`^Alternativa ${index + 1}`)).fill(text);
  await second.getByRole("radio", { name: "Correta (alternativa 1)" }).check();

  const third = card(page, 3);
  await third
    .getByLabel(/^Tipo/)
    .selectOption({ label: "Exercício de código" });
  await fillCommon(third, `Declare uma subclasse ${tag}`);
  await third
    .getByLabel(/^Instruções/)
    .fill("Declare Cachorro como subclasse de Animal.");
  await third
    .getByLabel(/^Solução esperada/)
    .fill("class Cachorro extends Animal {}");
  await third.getByLabel(/^Linguagem/).selectOption({ label: "Java" });

  await page.getByRole("button", { name: "Salvar no banco" }).click();
  await expect(page).toHaveURL(/\/exercicios\?criados=3$/);
  await expect(page.getByText("3 exercícios salvos.")).toBeVisible();

  await field(page, "Pesquisar no enunciado").fill(tag);
  await page.getByRole("button", { name: "Pesquisar" }).click();
  const rows = page
    .getByRole("table", { name: "Seus exercícios" })
    .getByRole("row");
  await expect(rows).toHaveCount(4); // the header and the three exercises
  await expect(
    page.getByRole("link", { name: `Declare uma subclasse ${tag}` }),
  ).toBeVisible();
  expect(Date.now() - started).toBeLessThan(300_000);
});

// 010/US2, 010/US4: "Criar com IA" on a topic of a confirmed syllabus, through the real OpenRouter
// adapter talking to the local mock; the drafts are reviewed and one is approved into the bank.
test("010/US2-1 010/US4-1 Criar com IA a partir de um tópico → lote em rascunho → aprovar um → aparece no banco como gerado por IA", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await enableExerciseGenerator(page);

  await logIn(page, classTeacher(), "/disciplinas");
  const subjectName = `Banco de Dados ${unique()}`;
  await createSubject(page, subjectName);
  await sendSyllabus(page, upload("ementa.png", syllabusFile("ementa.png")));
  await page.getByRole("link", { name: "ementa.png" }).click();
  await page
    .getByRole("button", { name: "Preencher manualmente" })
    .first()
    .click({ timeout: 30_000 });
  const syllabus = page.getByRole("form", { name: "Revisão 1 do conteúdo" });
  await syllabus.getByRole("button", { name: "Adicionar grupo" }).click();
  await field(syllabus, "Título do grupo").fill("Consultas");
  const item = syllabus.getByRole("textbox", {
    name: "Item 1 do grupo 1",
    exact: true,
  });
  if ((await item.count()) === 0)
    await syllabus
      .getByRole("button", { name: "Adicionar item ao grupo 1" })
      .click();
  await item.fill(TOPIC);
  await syllabus.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar conteúdo" })
    .click();
  await expect(
    page.getByText(/Conteúdo confirmado — revisão 1\./),
  ).toBeVisible();

  await page.goto("/exercicios/gerar");
  const form = page.getByRole("form", { name: "Criar exercícios com IA" });
  await form.getByLabel(/^Disciplina/).selectOption({ label: subjectName });
  await form.getByLabel(/^Ementa/).selectOption({ index: 1 });
  await form.getByLabel(/^Tópico/).selectOption({ label: TOPIC });
  await form.getByLabel(/^Dificuldade/).selectOption({ label: "Básico" });
  await form.getByLabel(/^Quantidade de exercícios/).selectOption("4");
  await expect(
    form.getByText(
      "Serão gerados: Pergunta e resposta 2 · Múltipla escolha 2.",
    ),
  ).toBeVisible();
  await form.getByRole("button", { name: "Gerar exercícios" }).click();

  // The batch list, then the batch: the worker runs the generation and the page follows it.
  await expect(page).toHaveURL(/\/exercicios\/lotes\?pedido=1$/);
  await page.getByRole("link", { name: TOPIC }).first().click();
  await expect(page.getByText("Gerado", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText(/4 para revisar · 0 aprovados · 0 excluídos/),
  ).toBeVisible();
  await expect(page.getByText(GENERATED[0]!.statement)).toBeVisible();

  await page.getByRole("button", { name: "Aprovar exercício 1" }).click();
  await expect(page.getByText("Exercício 1 aprovado.")).toBeVisible();

  // In the bank: approved, generated by AI, found by its statement.
  await page.goto("/exercicios");
  await field(page, "Pesquisar no enunciado").fill(GENERATED[0]!.statement);
  await page.getByRole("button", { name: "Pesquisar" }).click();
  const row = page
    .getByRole("row", {
      name: new RegExp(
        GENERATED[0]!.statement
          .slice(0, 30)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    })
    .first();
  await expect(row.getByText("Gerado por IA")).toBeVisible();
  await expect(row.getByText("Aprovado")).toBeVisible();
});
