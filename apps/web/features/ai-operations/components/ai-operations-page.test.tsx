import type { AiAgentOperationsView, AiHealth, AiMetrics, AiModelConfigView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { AiOperationsPage } from "./ai-operations-page";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const HEALTH: AiHealth = {
  checkedAt: "2026-09-25T12:00:00.000Z",
  modelConfigs: [
    { key: "cfg-a", provider: "prov", model: "modelo-a", status: "ENABLED", providerStatus: "UP" },
    { key: "cfg-b", provider: "prov", model: "modelo-b", status: "DISABLED", providerStatus: "NOT_CONFIGURED" },
  ],
};
const METRICS: AiMetrics = {
  from: "2026-09-18T12:00:00.000Z",
  to: "2026-09-25T12:00:00.000Z",
  byAgent: [
    { agentKey: "agente-a", agentVersion: 2, promptVersion: 3, provider: "prov", model: "modelo-a", executions: 10, completed: 7, failed: 1, timedOut: 1, cancelled: 1, avgDurationMs: 1500, modelCalls: 12, toolCalls: 4,
      outputInvalid: 1, proposals: { created: 4, approved: 2, partiallyApproved: 1, rejected: 1, expired: 0 }, avgTotalTokens: 2400, avgEstimatedCost: "0.012500", currency: "USD" },
  ],
  byModel: [{ provider: "prov", model: "modelo-a", calls: 12, inputTokens: null, outputTokens: 300, totalTokens: null, estimatedCost: null, currency: null }],
};
const AGENTS: AiAgentOperationsView[] = [
  { key: "agente-a", name: "Agente A", description: "d", status: "ACTIVE", version: 2, riskLevel: "L1_READ_ONLY", modelConfigKey: "cfg-a", promptVersion: 3, outputSchemaVersion: 1, toolKeys: [], queued: 3, running: 1 },
];
const CONFIGS: AiModelConfigView[] = [
  { key: "cfg-a", provider: "prov", model: "modelo-a", status: "ENABLED", maxOutputTokens: 1000, timeoutMs: 30000, hasPrice: true, agentKeys: ["agente-a"] },
];

type Routes = Partial<Record<"health" | "metrics" | "agents" | "model-configs", unknown>>;

describe("006/US7-6 tela Operação de IA", () => {
  const fetchMock = vi.fn<typeof fetch>();

  function serve(routes: Routes = {}, extra?: (url: string, init?: RequestInit) => Response | undefined) {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const custom = extra?.(url, init);
      if (custom) return custom;
      if (url.includes("/ai/operations/health")) return json(200, routes.health ?? HEALTH);
      if (url.includes("/ai/operations/metrics")) return json(200, routes.metrics ?? METRICS);
      if (url.includes("/ai/operations/agents")) return json(200, routes.agents ?? AGENTS);
      if (url.includes("/ai/operations/model-configs")) return json(200, routes["model-configs"] ?? CONFIGS);
      return json(404, { statusCode: 404, code: "NOT_FOUND", message: "x" });
    });
  }

  const renderPage = (canManage = true) => renderWithProviders(<Toaster><AiOperationsPage canManage={canManage} /></Toaster>);
  const calls = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // Radix Select measures its content.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = () => undefined;
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("007/FR-048 indicadores por agente: falhas de validação e decisões das propostas com a taxa ao lado, tokens e custo médios", async () => {
    serve();
    renderPage();
    const table = await screen.findByRole("table", { name: "Indicadores por agente" });
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(expect.arrayContaining(["Falhas de validação", "Propostas", "Aprovadas", "Aprovadas em parte", "Rejeitadas", "Tokens médios", "Custo médio"]));
    const cells = within(table).getAllByRole("cell").map((cell) => cell.textContent);
    const at = (header: string) => cells[headers.indexOf(header)];
    expect(at("Concluídas")).toBe("7 (70%)");
    expect(at("Falhas de validação")).toBe("1 (10%)");
    expect(at("Propostas")).toBe("4");
    expect(at("Aprovadas")).toBe("2 (50%)");
    expect(at("Aprovadas em parte")).toBe("1 (25%)");
    expect(at("Rejeitadas")).toBe("1 (25%)");
    expect(at("Tokens médios")).toBe("2.400");
    expect(at("Custo médio")).toBe("USD 0,0125");
  });

  it("mostra as 5 seções com dados, e as situações têm sempre texto e ícone", async () => {
    serve();
    const { container } = renderPage();
    for (const heading of ["Saúde", "Indicadores", "Uso e custo", "Agentes", "Configurações de modelo"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }
    expect(await screen.findByText("Respondendo")).toBeTruthy();
    expect(screen.getByText("Não configurado")).toBeTruthy();
    expect(await screen.findByRole("cell", { name: "1,5 s" })).toBeTruthy();
    expect(await screen.findByText("Agente A")).toBeTruthy();
    expect(screen.getByText("Leitura")).toBeTruthy();
    expect(screen.getByText("3 / 1")).toBeTruthy();
    for (const status of container.querySelectorAll('[data-slot="status"]')) {
      expect(status.textContent?.trim()).not.toBe("");
      expect(status.querySelector("svg")).not.toBeNull();
    }
    // A missing usage value reads "não informado".
    const usage = screen.getByRole("table", { name: "Uso e custo por modelo" });
    expect(within(usage).getAllByText("não informado").length).toBe(3);
    await expectNoA11yViolations(container);
  });

  it("vazias: cada seção diz que não há dados", async () => {
    serve({ health: { ...HEALTH, modelConfigs: [] }, metrics: { ...METRICS, byAgent: [], byModel: [] }, agents: [], "model-configs": [] });
    const { container } = renderPage();
    await waitFor(() => expect(screen.getAllByText("Nenhuma configuração de modelo registrada.")).toHaveLength(2));
    expect(await screen.findByText("Nenhuma execução no período.")).toBeTruthy();
    expect(screen.getByText("Nenhuma chamada ao modelo no período.")).toBeTruthy();
    expect(await screen.findByText("Nenhum agente registrado.")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("o Select de período refaz a consulta com o novo período", async () => {
    serve();
    renderPage();
    await screen.findByText("Agente A");
    expect(calls("/ai/operations/metrics?period=7d")).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Período" }));
    await user.click(await screen.findByRole("option", { name: "Últimos 30 dias" }));
    await waitFor(() => expect(calls("/ai/operations/metrics?period=30d")).toHaveLength(1));
  });

  it("\"Verificar de novo\" consulta a saúde outra vez", async () => {
    serve();
    renderPage();
    await screen.findByText("Respondendo");
    await userEvent.setup().click(screen.getByRole("button", { name: "Verificar de novo" }));
    await waitFor(() => expect(calls("/ai/operations/health")).toHaveLength(2));
  });

  it("Desabilitar pede confirmação com as consequências, envia DISABLED e mostra o toast", async () => {
    serve({}, (url, init) =>
      url.includes("/agents/agente-a/status") && init?.method === "POST" ? json(200, { ...AGENTS[0], status: "DISABLED", queued: 0 }) : undefined,
    );
    renderPage();
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Desabilitar o agente Agente A" });
    await user.click(button);
    const dialog = await screen.findByRole("alertdialog", { name: "Desabilitar o agente Agente A?" });
    expect(dialog.textContent).toContain("Pedidos novos serão recusados e as 3 execuções na fila serão canceladas.");
    await user.click(within(dialog).getByRole("button", { name: "Desabilitar" }));

    const post = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/agents/agente-a/status") && init?.method === "POST")!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({ status: "DISABLED" });
    expect(await screen.findByText("Agente Agente A desabilitado.")).toBeTruthy();
    await waitFor(() => expect(calls("/ai/operations/agents").length).toBeGreaterThan(2));
  });

  it("erro da ação aparece como Alert perto da tabela, com o texto do catálogo", async () => {
    serve({}, (url, init) =>
      url.includes("/model-configs/cfg-a/status") && init?.method === "POST"
        ? json(409, { statusCode: 409, code: "INVALID_STATE_TRANSITION", message: "texto da API" })
        : undefined,
    );
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Desabilitar a configuração cfg-a" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Os agentes agente-a deixarão de aceitar pedidos novos.");
    await user.click(within(dialog).getByRole("button", { name: "Desabilitar" }));
    expect(await screen.findByText("Operação não permitida no estado atual.")).toBeTruthy();
    expect(screen.queryByText("texto da API")).toBeNull();
  });

  it("sem ia.agentes.gerenciar, as ações ficam escondidas", async () => {
    serve();
    renderPage(false);
    await screen.findByText("Agente A");
    expect(screen.queryByRole("button", { name: /^(Desabilitar|Habilitar) / })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Ações" })).toBeNull();
  });

  it("006/SC-012 Tab: Select → Verificar de novo → ações das linhas; o foco volta ao botão depois do diálogo", async () => {
    serve();
    renderPage();
    await screen.findByText("Agente A");
    await screen.findByRole("button", { name: "Desabilitar a configuração cfg-a" });
    const user = userEvent.setup();
    const agentButton = screen.getByRole("button", { name: "Desabilitar o agente Agente A" });
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Verificar de novo" }),
      screen.getByRole("combobox", { name: "Período" }),
      agentButton,
      screen.getByRole("button", { name: "Desabilitar a configuração cfg-a" }),
    ]);

    agentButton.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(document.activeElement).toBe(agentButton));
  });
});
