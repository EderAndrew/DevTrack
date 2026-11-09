import { expect, type Page } from "@playwright/test";
import { sendSyllabus, syllabusFile, upload } from "./curriculum.ts";
import { field } from "./journeys.ts";

/** The syllabus of the seed's subject (an image, filled in by hand) confirmed with one group; returns the revision and its item ids. */
export async function confirmedSyllabus(page: Page, subjectId: string, items: string[]): Promise<{ revisionId: string; itemIds: string[] }> {
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
