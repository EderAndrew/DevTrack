import { expect, test } from "@playwright/test";
import { bootstrapAdmin, classTeacher, logIn } from "./fixtures/journeys.ts";

// 006/US7, 007, 008, 009: production registers only the curriculum agent, its tasks and the model
// catalog, and with the E2E key the OpenRouter provider, answered by the local mock
// (e2e/openrouter-mock.ts). The metrics depend on the other journeys running in parallel, so only
// their section is checked.

test("006/US7-6 009/US6-2 ADMIN abre cada seção de Operação de IA pelo menu: o agente da 007, tarefas, catálogo, orçamentos, saúde e período pelo teclado", async ({ page }) => {
  await logIn(page, bootstrapAdmin(), "/conta/perfil");
  // 006 contracts/web-ui.md (amendment 2026-10-22): the sections are the sub-items of the menu group
  // "Operação de IA", each a link to its `?aba=`; the page shows only that section, with no tabs.
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await expect(menu.getByRole("button", { name: "Operação de IA" })).toHaveAttribute("aria-expanded", "true");
  const region = (name: string) => page.getByRole("region", { name });
  const openSection = async (name: string, aba: string) => {
    await menu.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(`/admin/ia?aba=${aba}`);
    await expect(menu.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  };

  await openSection("Saúde", "saude");
  await expect(page.getByRole("heading", { level: 1, name: "Operação de IA" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(region("Saúde").getByText("anthropic-basic", { exact: true })).toBeVisible();
  await expect(region("Saúde").getByText("Respondendo").first()).toBeVisible();
  await page.getByRole("button", { name: "Verificar de novo" }).click();
  await expect(region("Saúde").getByText("Respondendo").first()).toBeVisible();

  await openSection("Indicadores", "indicadores");
  for (const section of ["Indicadores", "Uso e custo"]) await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Saúde" })).toHaveCount(0);
  await openSection("Orçamentos", "orcamentos");
  await expect(page.getByRole("heading", { level: 2, name: "Orçamentos" })).toBeVisible();
  // 009: the analysis's task is BASIC; the catalog lists every entry with its tier.
  await openSection("Tarefas", "tarefas");
  await expect(region("Tarefas").getByRole("cell", { name: "curriculum-extraction", exact: true })).toBeVisible();
  await openSection("Modelos", "modelos");
  await expect(page.getByRole("table", { name: "Catálogo de modelos" }).getByRole("cell", { name: "typesafe-decision-basic", exact: true })).toBeVisible();
  await openSection("Agentes", "agentes");
  await expect(region("Agentes").getByText("Curriculum Agent")).toBeVisible();
  await openSection("Configurações de modelo", "configuracoes");
  await expect(region("Configurações de modelo").getByText("openai-basic", { exact: true })).toBeVisible();

  // A reload opens the same section, marked in the menu.
  await page.reload();
  await expect(region("Configurações de modelo").getByText("openai-basic", { exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Configurações de modelo" })).toHaveAttribute("aria-current", "page");

  // Keyboard: Período of Indicadores is operated with the keyboard.
  await openSection("Indicadores", "indicadores");
  const period = page.getByLabel("Período");
  await period.focus();
  await expect(period).toHaveText("Últimos 7 dias");
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Últimos 30 dias" }).focus();
  await page.keyboard.press("Enter");
  await expect(period).toHaveText("Últimos 30 dias");
  await expect(period).toBeFocused();
});

test("006/US7-7 professor não vê o grupo, e /admin/ia mostra sem acesso", async ({ page }) => {
  await logIn(page, classTeacher(), "/disciplinas");
  await expect(page.getByRole("navigation", { name: "Menu principal" }).getByRole("button", { name: "Operação de IA" })).toHaveCount(0);
  await page.goto("/admin/ia");
  await expect(page.getByText("Você não tem acesso a esta área.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Saúde" })).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});
