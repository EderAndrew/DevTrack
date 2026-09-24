import { expect, test } from "@playwright/test";
import { createSubject, syllabusFile, unique, upload } from "./fixtures/curriculum.ts";
import { classTeacher, logIn } from "./fixtures/journeys.ts";

const MIB = 1024 * 1024;

/** A valid PNG of exactly `size` bytes: readers ignore the bytes after IEND. */
const pngOf = (size: number) => {
  const image = syllabusFile("ementa.png");
  return Buffer.concat([image, Buffer.alloc(size - image.length)]);
};

// 004/SC-011 research E5: a 10 MB file goes through the Next.js rewrite to the API and is
// accepted; one byte more is refused with "O arquivo passa de 10 MB.".
test("004/SC-011 envio de 10 MB passa pela rewrite; 10 MB + 1 → \"O arquivo passa de 10 MB.\"", async ({ page }) => {
  await logIn(page, classTeacher(), "/disciplinas");
  await createSubject(page, `Limite de envio ${unique()}`);
  const input = page.getByLabel("Arquivo da ementa");

  await input.setInputFiles(upload("grande.png", pngOf(10 * MIB + 1)));
  await expect(page.getByText("O arquivo passa de 10 MB.")).toBeVisible();

  await input.setInputFiles(upload("limite.png", pngOf(10 * MIB)));
  const response = page.waitForResponse((res) => res.url().includes("/syllabus-documents") && res.request().method() === "POST");
  await page.getByRole("button", { name: "Enviar ementa" }).click();
  expect((await response).status()).toBe(201);
  await expect(page.getByText("Ementa enviada.")).toBeVisible();
  await expect(page.getByRole("link", { name: "limite.png" })).toBeVisible();
});
