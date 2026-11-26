import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { API_DIR } from "../env.ts";
import { addClassThroughForm, createCohortThroughApi, field } from "./journeys.ts";

/** Syllabus fixtures shared with the API tests (apps/api/test/fixtures/syllabus/). */
export const syllabusFile = (name: string) => readFileSync(join(API_DIR, "test/fixtures/syllabus", name));

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

/** A file for `setInputFiles` built from bytes. */
export const upload = (name: string, buffer: Buffer) => ({ name, mimeType: MIME[name.split(".").at(-1)!] ?? "application/octet-stream", buffer });

/** A unique suffix, so parallel journeys of the same teacher never share names or codes. */
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** "Nova disciplina" → the subject page; returns its id. */
export async function createSubject(page: Page, name: string): Promise<string> {
  await page.goto("/disciplinas/nova");
  await field(page, "Nome").fill(name);
  await page.getByRole("button", { name: "Criar disciplina" }).click();
  await expect(page).toHaveURL(/\/disciplinas\/[0-9a-f-]{36}/);
  await expect(page.getByText("Disciplina criada.")).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}

/**
 * Since 027: a turma named `name` (created by the run's ADMIN, the MANAGER function) with the teacher's `subjectName`
 * added to it through "Acrescentar disciplina a uma turma", with its dates; returns the class id.
 */
export async function createOffering(
  page: Page,
  name: string,
  subjectName: string,
  period: { startsOn: string; endsOn: string },
): Promise<string> {
  await createCohortThroughApi(page.context().browser()!, name);
  return addClassThroughForm(page, name, name, subjectName, period);
}

/** Sends a syllabus file from the page's upload area and waits for "Ementa enviada.". */
export async function sendSyllabus(page: Page, file: ReturnType<typeof upload>): Promise<void> {
  await page.getByLabel("Arquivo da ementa").setInputFiles(file);
  await page.getByRole("button", { name: "Enviar ementa" }).click();
  await expect(page.getByText("Ementa enviada.")).toBeVisible();
}

/** The day button of "YYYY-MM-DD" in the class calendar (`data-day` is pt-BR). */
export const dayButton = (page: Page, date: string) => {
  const [year, month, day] = date.split("-");
  return page.locator(`button[data-day="${day}/${month}/${year}"]`);
};

/**
 * 031: marks a day of the class calendar through "Marcar dia" — the kind (Aula by default) and its texts, by label
 * ("Descrição", "Motivo (só você vê)", "Aviso para a turma (opcional)") — and waits for the modal to close.
 */
export async function markDay(page: Page, date: string, kind = "Aula", texts: Record<string, string> = {}): Promise<void> {
  await dayButton(page, date).click();
  const dialog = page.getByRole("dialog", { name: /^Marcar dia/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: kind, exact: true }).check();
  for (const [label, value] of Object.entries(texts)) await dialog.getByRole("textbox", { name: label }).fill(value);
  await dialog.getByRole("button", { name: "Confirmar" }).click();
  await expect(dialog).toBeHidden();
}
