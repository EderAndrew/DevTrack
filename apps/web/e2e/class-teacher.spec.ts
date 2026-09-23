import { expect, test } from "@playwright/test";
import { classTeacher, createClassThroughForm, field, logIn } from "./fixtures/journeys.ts";
import { uniqueEmail } from "./fixtures/emails.ts";

// 003 SC-010, journey 1: the teacher creates a class, opens it, invites a student by e-mail only
// and sees the pending invitation in the "Convites" tab.
test("003/SC-010 003/US2-1 professor cria turma, convida aluno e vê o convite pendente", async ({ page }) => {
  await logIn(page, classTeacher(), "/turmas");
  const classId = await createClassThroughForm(page, "Turma Convites E2E");
  await expect(page).toHaveURL(`/turmas/${classId}`);

  const email = uniqueEmail("aluno-pendente");
  await page.getByRole("button", { name: "Convidar aluno" }).click();
  const dialog = page.getByRole("dialog", { name: "Convidar aluno" });
  await field(dialog, "E-mail").fill(email);
  await dialog.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();

  await page.getByRole("tab", { name: "Convites" }).click();
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(row.getByText("Pendente", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `Reenviar convite para ${email}` })).toBeVisible();
});
