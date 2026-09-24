import { expect, test } from "@playwright/test";
import { createOffering, createSubject, dayButton, sendSyllabus, syllabusFile, unique, upload } from "./fixtures/curriculum.ts";
import { classTeacher, field, logIn } from "./fixtures/journeys.ts";

/** 18 class days: Mondays and Wednesdays of March (10) and April (8) 2027. */
const MARCH = ["01", "03", "08", "10", "15", "17", "22", "24", "29", "31"].map((day) => `2027-03-${day}`);
const APRIL = ["05", "07", "12", "14", "19", "21", "26", "28"].map((day) => `2027-04-${day}`);

// 004/SC-011: the critical journey in the browser, from the subject to the confirmed plan. The
// teacher of the run (class-teacher-setup.spec.ts) creates its own subject and class.
test("004/SC-011 disciplina → turma → ementa em PDF → revisão → calendário → tópicos → planejamento confirmado", async ({ page }) => {
  test.setTimeout(120_000);
  const subjectName = `Programação Orientada a Objetos ${unique()}`;
  const className = `POO E2E ${unique()}`;

  await logIn(page, classTeacher(), "/disciplinas");
  await createSubject(page, subjectName);
  const classId = await createOffering(page, className, subjectName, { startsOn: "2027-03-01", endsOn: "2027-07-16" });

  // Syllabus sent from the class: the version link keeps ?turma= to come back and use it.
  await page.goto(`/turmas/${classId}/ementa`);
  await sendSyllabus(page, upload("poo.pdf", syllabusFile("poo.pdf")));
  await page.getByRole("link", { name: "poo.pdf" }).click();
  await expect(page).toHaveURL(/\?turma=/);
  await expect(page.getByText("Processado")).toBeVisible({ timeout: 30_000 });

  // 004/US3: review the extracted content and confirm it.
  await page.getByRole("button", { name: "Revisar conteúdo" }).click();
  const form = page.getByRole("form", { name: "Revisão 1 do conteúdo" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar conteúdo" }).click();
  await expect(page.getByText("Conteúdo confirmado.", { exact: true })).toBeAttached();

  // 004/US2-1 004/FR-006: the class that sent it uses it.
  const offer = page.getByRole("alertdialog", { name: `Usar esta ementa na turma ${className}?` });
  await offer.getByRole("button", { name: "Usar ementa" }).click();
  await expect(page.getByText(`A turma ${className} agora usa esta ementa.`)).toBeVisible();

  // 004/US4: 18 class days.
  await page.goto(`/turmas/${classId}/calendario`);
  for (const date of MARCH) await dayButton(page, date).click();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  for (const date of APRIL) await dayButton(page, date).click();
  await expect(page.getByText("Total de aulas selecionadas: 18")).toBeVisible();
  await page.getByRole("button", { name: "Salvar calendário" }).click();
  await expect(page.getByText("Calendário salvo.")).toBeVisible();

  // 004/US5: topics linked to syllabus items and class days.
  await page.goto(`/turmas/${classId}/planejamento`);
  const createTopic = async (title: string, meeting: string | null) => {
    await page.getByRole("button", { name: "Novo tópico" }).click();
    const dialog = page.getByRole("dialog", { name: "Novo tópico" });
    await field(dialog, "Título").fill(title);
    if (meeting) await dialog.getByLabel("Aula", { exact: true }).selectOption({ label: meeting });
    await dialog.getByRole("checkbox").first().check();
    await dialog.getByRole("button", { name: "Criar tópico" }).click();
    await expect(page.getByText("Tópico criado.")).toBeVisible();
  };
  await createTopic("Herança", "Aula 02 — 03/03/2027");
  await createTopic("Modificadores de acesso", "Aula 03 — 08/03/2027");
  await createTopic("SOLID", null);
  await expect(page.getByRole("region", { name: "Aula 02 — 03/03/2027" }).getByText("Herança")).toBeVisible();

  // 004/US6: merge, split and archive.
  await page.getByRole("checkbox", { name: "Juntar Herança" }).check();
  await page.getByRole("checkbox", { name: "Juntar Modificadores de acesso" }).check();
  await page.getByRole("button", { name: "Juntar tópicos (2)" }).click();
  const merge = page.getByRole("dialog", { name: "Juntar tópicos" });
  await expect(field(merge, "Título")).toHaveValue("Herança + Modificadores de acesso");
  await merge.getByRole("button", { name: "Juntar tópicos" }).click();
  await expect(page.getByText("Tópicos juntados.")).toBeVisible();

  await page.getByRole("button", { name: "Dividir SOLID" }).click();
  const split = page.getByRole("dialog", { name: "Dividir tópico" });
  await field(split.getByRole("group", { name: "Parte 2" }), "Título").fill("SOLID — parte 2");
  await split.getByRole("button", { name: "Dividir tópico" }).click();
  await expect(page.getByText("Tópico dividido.")).toBeVisible();

  await page.getByRole("button", { name: "Arquivar SOLID — parte 2" }).click();
  await expect(page.getByText("Tópico arquivado.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tópicos arquivados" }).getByText("SOLID — parte 2")).toBeVisible();

  // 004/US7: confirm the plan.
  await page.getByRole("button", { name: "Confirmar planejamento" }).click();
  await expect(page.getByText("Planejamento confirmado.")).toBeVisible();
  await expect(page.getByText("Situação: Pronto")).toBeVisible();
});
