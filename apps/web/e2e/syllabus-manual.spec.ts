import { expect, test } from "@playwright/test";
import { createSubject, sendSyllabus, syllabusFile, unique, upload } from "./fixtures/curriculum.ts";
import { classTeacher, field, logIn } from "./fixtures/journeys.ts";

// 004/SC-011, 004/US3-4: an image has no text to read (no OCR); the teacher fills the content in.
test("004/SC-011 ementa em imagem → sem texto → preenchimento manual → confirmação", async ({ page }) => {
  await logIn(page, classTeacher(), "/disciplinas");
  const subjectId = await createSubject(page, `Estruturas de Dados ${unique()}`);

  await sendSyllabus(page, upload("ementa.png", syllabusFile("ementa.png")));
  await page.getByRole("link", { name: "ementa.png" }).click();
  await expect(page).toHaveURL(new RegExp(`/disciplinas/${subjectId}/ementa/`));
  await expect(page.getByText("Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("img", { name: /Ementa enviada/ })).toBeVisible();

  await page.getByRole("button", { name: "Preencher manualmente" }).first().click();
  const form = page.getByRole("form", { name: "Revisão 1 do conteúdo" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Adicionar grupo" }).click();
  await field(form, "Título do grupo").fill("Estruturas lineares");
  const item = form.getByRole("textbox", { name: "Item 1 do grupo 1", exact: true });
  if ((await item.count()) === 0) await form.getByRole("button", { name: "Adicionar item ao grupo 1" }).click();
  await item.fill("Listas, pilhas e filas");

  await form.getByRole("button", { name: "Confirmar conteúdo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar conteúdo" }).click();
  await expect(page.getByText(/Conteúdo confirmado — revisão 1\./)).toBeVisible();
  await expect(page.getByText("Listas, pilhas e filas")).toBeVisible();
});
