import { expect, type Page, test } from "@playwright/test";
import { createSubject, sendSyllabus, syllabusFile, unique, upload } from "./fixtures/curriculum.ts";
import { bootstrapAdmin, classTeacher, logIn } from "./fixtures/journeys.ts";

/**
 * The agent is registered disabled (007/FR-051): the ADMIN enables it in "Operação de IA", as the
 * release gate says. Idempotent, since other runs or retries may have enabled it already.
 */
async function enableCurriculumAgent(page: Page): Promise<void> {
  await logIn(page, bootstrapAdmin(), "/admin/ia?aba=agentes");
  const agents = page.getByRole("region", { name: "Agentes" });
  await expect(agents.getByText("Curriculum Agent")).toBeVisible();
  const enable = agents.getByRole("button", { name: "Habilitar o agente Curriculum Agent" });
  if (await enable.isVisible()) {
    await enable.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Habilitar" }).click();
  }
  await expect(agents.getByRole("button", { name: "Desabilitar o agente Curriculum Agent" })).toBeVisible();
  await page.context().clearCookies();
}

// 007/SC-001: from "Preencher com IA" to a confirmed syllabus in under 3 minutes, against the real
// OpenRouter adapter talking to the local mock (e2e/openrouter-mock.ts), which replays the POO case.
test("007/SC-001 upload de poo.pdf → Preencher com IA → revisão → aplicar sem um grupo → editar → confirmar, em menos de 3 min", async ({ page }) => {
  test.setTimeout(180_000);
  await enableCurriculumAgent(page);

  await logIn(page, classTeacher(), "/disciplinas");
  const subjectId = await createSubject(page, `Programação Orientada a Objetos ${unique()}`);
  await sendSyllabus(page, upload("poo.pdf", syllabusFile("poo.pdf")));
  await page.getByRole("link", { name: "poo.pdf" }).click();
  await expect(page).toHaveURL(new RegExp(`/disciplinas/${subjectId}/ementa/`));

  const started = Date.now();
  const panel = page.getByRole("region", { name: "Preencher com IA" });
  const fill = panel.getByRole("button", { name: "Preencher com IA" });
  await expect(fill).toBeEnabled({ timeout: 30_000 });
  await expect(panel.getByText("O conteúdo do documento será enviado a um provedor de IA externo.")).toBeVisible();
  await fill.click();

  // The analysis runs on the worker; the panel follows it and links the proposal.
  await panel.getByRole("link", { name: "Revisar proposta" }).click({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Proposta da IA para a ementa" })).toBeVisible();

  // Every field and group comes checked; the teacher leaves the third group out.
  await expect(page.getByRole("checkbox", { name: "Fundamentos de POO" })).toBeChecked();
  await page.getByRole("checkbox", { name: "POO em Ambientes Reais" }).uncheck();
  await page.getByRole("button", { name: "Aplicar à ementa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Aplicar à ementa" }).click();

  // Back on the document: the AI_ASSISTED draft in the 004 editor, with three groups.
  await expect(page).toHaveURL(new RegExp(`/disciplinas/${subjectId}/ementa/[0-9a-f-]{36}$`));
  const form = page.getByRole("form", { name: /Revisão \d+ do conteúdo/ });
  await expect(form).toBeVisible();
  await expect(form.getByText("Preenchido com IA — revise o conteúdo antes de confirmar.")).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Item 1 do grupo 3", exact: true })).toHaveValue("Modularização e organização de código");
  await expect(form.getByRole("textbox", { name: "Item 1 do grupo 4", exact: true })).toHaveCount(0);

  const item = form.getByRole("textbox", { name: "Item 1 do grupo 1", exact: true });
  await item.fill("Classes, objetos e métodos em Java");
  await form.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar conteúdo" }).click();

  await expect(page.getByText(/Conteúdo confirmado — revisão \d+\./)).toBeVisible();
  await expect(page.getByText("Classes, objetos e métodos em Java")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(180_000);
});
