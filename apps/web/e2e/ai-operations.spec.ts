import { expect, test } from "@playwright/test";
import { bootstrapAdmin, classTeacher, logIn } from "./fixtures/journeys.ts";

// 006/US7, 007: production registers only the curriculum agent and its model config, and with the
// E2E key the Anthropic provider, answered by the local mock (e2e/anthropic-mock.ts). The metrics
// depend on the other journeys running in parallel, so only their section is checked.

test("006/US7-6 ADMIN abre Operação de IA pelo menu: o agente e a configuração da 007, saúde e período pelo teclado", async ({ page }) => {
  await logIn(page, bootstrapAdmin(), "/conta/perfil");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Operação de IA" }).click();
  await expect(page).toHaveURL("/admin/ia");
  await expect(page.getByRole("heading", { level: 1, name: "Operação de IA" })).toBeVisible();

  for (const section of ["Saúde", "Indicadores", "Uso e custo", "Agentes", "Configurações de modelo"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }
  const region = (name: string) => page.getByRole("region", { name });
  await expect(region("Saúde").getByText("curriculum-extraction-default")).toBeVisible();
  await expect(region("Saúde").getByText("Respondendo")).toBeVisible();
  await expect(region("Agentes").getByText("Curriculum Agent")).toBeVisible();
  await expect(region("Configurações de modelo").getByText("curriculum-extraction-default")).toBeVisible();

  await page.getByRole("button", { name: "Verificar de novo" }).click();
  await expect(region("Saúde").getByText("Respondendo")).toBeVisible();

  const period = page.getByLabel("Período");
  await period.focus();
  await expect(period).toHaveText("Últimos 7 dias");
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Últimos 30 dias" }).focus();
  await page.keyboard.press("Enter");
  await expect(period).toHaveText("Últimos 30 dias");
  await expect(period).toBeFocused();
});

test("006/US7-7 professor não vê o item, e /admin/ia mostra sem acesso", async ({ page }) => {
  await logIn(page, classTeacher(), "/disciplinas");
  await expect(page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Operação de IA" })).toHaveCount(0);
  await page.goto("/admin/ia");
  await expect(page.getByText("Você não tem acesso a esta área.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Saúde" })).toHaveCount(0);
});
