import { expect, test } from "@playwright/test";
import { bootstrapAdmin, classTeacher, logIn } from "./fixtures/journeys.ts";

// 006/US7, 007, 008, 009: production registers only the curriculum agent, its tasks and the model
// catalog, and with the E2E key the OpenRouter provider, answered by the local mock
// (e2e/openrouter-mock.ts). The metrics depend on the other journeys running in parallel, so only
// their section is checked.

test("006/US7-6 009/US6-2 ADMIN abre Operação de IA pelo menu: o agente da 007, tarefas, catálogo, orçamentos, saúde e período pelo teclado", async ({ page }) => {
  await logIn(page, bootstrapAdmin(), "/conta/perfil");
  await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Operação de IA" }).click();
  await expect(page).toHaveURL("/admin/ia");
  await expect(page.getByRole("heading", { level: 1, name: "Operação de IA" })).toBeVisible();

  // 006 contracts/web-ui.md (amendment 2026-09-29): one tab per group; only the active one is rendered.
  const tabs = page.getByRole("tablist", { name: "Seções da operação de IA" });
  const region = (name: string) => page.getByRole("region", { name });
  const openTab = async (name: string, aba: string) => {
    await tabs.getByRole("tab", { name }).click();
    await expect(tabs.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(`/admin/ia?aba=${aba}`);
  };

  await expect(tabs.getByRole("tab", { name: "Saúde" })).toHaveAttribute("aria-selected", "true");
  await expect(region("Saúde").getByText("anthropic-basic", { exact: true })).toBeVisible();
  await expect(region("Saúde").getByText("Respondendo").first()).toBeVisible();
  await page.getByRole("button", { name: "Verificar de novo" }).click();
  await expect(region("Saúde").getByText("Respondendo").first()).toBeVisible();

  await openTab("Indicadores", "indicadores");
  for (const section of ["Indicadores", "Uso e custo"]) await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  await openTab("Orçamentos", "orcamentos");
  await expect(page.getByRole("heading", { level: 2, name: "Orçamentos" })).toBeVisible();
  // 009: the analysis's task is BASIC; the catalog lists every entry with its tier.
  await openTab("Tarefas", "tarefas");
  await expect(region("Tarefas").getByRole("cell", { name: "curriculum-extraction", exact: true })).toBeVisible();
  await openTab("Modelos", "modelos");
  await expect(page.getByRole("table", { name: "Catálogo de modelos" }).getByRole("cell", { name: "typesafe-decision-basic", exact: true })).toBeVisible();
  await openTab("Agentes", "agentes");
  await expect(region("Agentes").getByText("Curriculum Agent")).toBeVisible();
  await openTab("Configurações de modelo", "configuracoes");
  await expect(region("Configurações de modelo").getByText("openai-basic", { exact: true })).toBeVisible();

  // A reload opens the same tab.
  await page.reload();
  await expect(tabs.getByRole("tab", { name: "Configurações de modelo" })).toHaveAttribute("aria-selected", "true");
  // The reopened tab loads its data before the keyboard part.
  await expect(region("Configurações de modelo").getByText("openai-basic", { exact: true })).toBeVisible();

  // Keyboard: the arrows move between tabs; Tab goes on into the panel (Período).
  // Radix moves the focus in a timeout: wait for each key to land before the next one.
  await tabs.getByRole("tab", { name: "Configurações de modelo" }).focus();
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: "Saúde" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Indicadores" })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "Indicadores" })).toHaveAttribute("aria-selected", "true");
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
  await expect(page.getByRole("tablist", { name: "Seções da operação de IA" })).toHaveCount(0);
});
