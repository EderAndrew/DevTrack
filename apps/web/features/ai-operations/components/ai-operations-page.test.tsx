import type { AiAgentOperationsView, AiHealth, AiMetrics, AiModelCatalogView, AiModelConfigView, AiTaskPolicyView } from "@repo/contracts";
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
    { key: "cfg-a", provider: "prov", model: "modelo-a", status: "ENABLED", providerStatus: "UP", circuit: "OPEN" },
    { key: "cfg-b", provider: "prov", model: "modelo-b", status: "DISABLED", providerStatus: "NOT_CONFIGURED", circuit: "CLOSED" },
  ],
};
const METRICS: AiMetrics = {
  from: "2026-09-18T12:00:00.000Z",
  to: "2026-09-25T12:00:00.000Z",
  byAgent: [
    { agentKey: "agente-a", agentVersion: 2, promptVersion: 3, provider: "prov", model: "modelo-a", taskKey: "tarefa-a", executions: 10, completed: 7, failed: 1, timedOut: 1, cancelled: 1, fallbacks: 2, escalations: 1, avgDurationMs: 1500, modelCalls: 12, toolCalls: 4,
      outputInvalid: 1, proposals: { created: 4, approved: 2, partiallyApproved: 1, rejected: 1, expired: 0 }, avgTotalTokens: 2400, avgEstimatedCost: "0.012500", currency: "USD" },
  ],
  byModel: [{ provider: "prov", model: "modelo-a", tier: "BASIC", family: "anthropic", calls: 12, failedCalls: 3, fallbackCalls: 2, avgDurationMs: 800, inputTokens: null, outputTokens: 300, totalTokens: null, estimatedCost: null, currency: null }],
  byTask: [
    { taskKey: "tarefa-a", agentKeys: ["agente-a"], executions: 10, calls: 12, inputTokens: 9000, outputTokens: 300, avgDurationMs: 800, estimatedCost: "0.125000", currency: "USD", fallbacks: 2, escalations: 1 },
  ],
  byTier: [
    { tier: "BASIC", calls: 11, inputTokens: 8000, outputTokens: 250, avgDurationMs: 700, estimatedCost: "0.100000", currency: "USD" },
    { tier: "STANDARD", calls: 1, inputTokens: 1000, outputTokens: 50, avgDurationMs: 1900, estimatedCost: "0.025000", currency: "USD" },
    { tier: null, calls: 2, inputTokens: null, outputTokens: null, avgDurationMs: null, estimatedCost: null, currency: null },
  ],
  byFamily: [
    { family: "anthropic", calls: 10, inputTokens: 7000, outputTokens: 200, avgDurationMs: 750, estimatedCost: "0.090000", currency: "USD", fallbackCalls: 0 },
    { family: "openai", calls: 2, inputTokens: 2000, outputTokens: 100, avgDurationMs: 900, estimatedCost: "0.035000", currency: "USD", fallbackCalls: 2 },
  ],
};
const CAPABILITIES = { structuredOutput: true, tools: true, vision: false, reasoning: false };
const MODELS: AiModelCatalogView[] = [
  {
    key: "anthropic-basic", family: "anthropic", model: "anthropic/modelo-basico", tier: "BASIC", mode: "GENERATION", lifecycle: "PRODUCTION", status: "ENABLED",
    capabilities: CAPABILITIES, contextWindow: 200000, price: { inputPerMTok: "1", outputPerMTok: "5", currency: "USD" },
    approvals: [{ taskKey: "tarefa-a", valid: true, metrics: { itemRecall: 0.96, schemaValidity: 1 }, evaluatedAt: "2026-09-27T12:00:00.000Z", avgCostPerExecution: "0.012500" }],
  },
  {
    key: "typesafe-decision", family: "typesafe", model: "typesafe/decisor", tier: "BASIC", mode: "DECISION", lifecycle: "CANDIDATE", status: "ENABLED",
    capabilities: { structuredOutput: false, tools: false, vision: false, reasoning: false }, contextWindow: 64000, price: null,
    approvals: [{ taskKey: "tarefa-b", valid: false, metrics: { accuracy: 0.7 }, evaluatedAt: "2026-09-27T12:00:00.000Z", avgCostPerExecution: null }],
  },
];
const TASK_BASE: Omit<AiTaskPolicyView, "key" | "selection" | "agentKeys"> = {
  mode: "GENERATION", minimumTier: "BASIC", preferredTier: "BASIC", maxTier: "STANDARD", allowedFamilies: ["anthropic", "openai"],
  requiredCapabilities: ["structuredOutput"], fallback: "SAME_TIER", escalation: "ON_OUTPUT_INVALID", quality: { schemaValidity: 1 }, override: null,
};
const TASKS: AiTaskPolicyView[] = [
  { ...TASK_BASE, key: "tarefa-a", agentKeys: ["agente-a"], selection: { primaryKey: "anthropic-basic", fallbackKey: "openai-basic", reason: "LOWEST_COST" } },
  { ...TASK_BASE, key: "tarefa-b", agentKeys: [], escalation: "NONE", maxTier: "BASIC", selection: { unavailable: "NO_APPROVED_MODEL" } },
  { ...TASK_BASE, key: "tarefa-c", agentKeys: [], selection: { primaryKey: "anthropic-antigo", fallbackKey: null, reason: "DEPRECATED_ONLY" } },
];
const AGENTS: AiAgentOperationsView[] = [
  { key: "agente-a", name: "Agente A", description: "d", status: "ACTIVE", version: 2, riskLevel: "L1_READ_ONLY", taskKey: "tarefa-a", primaryModelConfigKey: "cfg-a", fallbackModelConfigKey: "cfg-b", promptVersion: 3, outputSchemaVersion: 1, toolKeys: [], queued: 3, running: 1 },
];
const CONFIGS: AiModelConfigView[] = [
  { key: "cfg-a", provider: "prov", model: "modelo-a", status: "ENABLED", maxOutputTokens: 1000, timeoutMs: 30000, hasPrice: true, agentKeys: ["agente-a"] },
];

type Routes = Partial<Record<"health" | "metrics" | "agents" | "model-configs" | "models" | "tasks", unknown>>;

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
      if (url.includes("/ai/operations/models")) return json(200, routes.models ?? MODELS);
      if (url.includes("/ai/operations/tasks")) return json(200, routes.tasks ?? TASKS);
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

  it("008/US5-1 agentes com tarefa, principal e fallback; fallbacks por agente; falhas, fallbacks e duração média por modelo", async () => {
    serve({
      agents: [
        ...AGENTS,
        { ...AGENTS[0]!, key: "agente-b", name: "Agente B", taskKey: null, primaryModelConfigKey: "cfg-a", fallbackModelConfigKey: null },
      ],
    });
    const { container } = renderPage();

    const agents = await screen.findByRole("table", { name: "Agentes de IA" });
    await within(agents).findByText("Agente B");
    const agentHeaders = within(agents).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(agentHeaders).toEqual(expect.arrayContaining(["Tarefa", "Modelo principal", "Fallback"]));
    const [rowA, rowB] = within(agents).getAllByRole("row").slice(1);
    const cellOf = (row: HTMLElement, header: string) => within(row).getAllByRole("cell")[agentHeaders.indexOf(header)]!.textContent;
    expect([cellOf(rowA!, "Tarefa"), cellOf(rowA!, "Modelo principal"), cellOf(rowA!, "Fallback")]).toEqual(["tarefa-a", "cfg-a", "cfg-b"]);
    // Without a task (a version before 008) and without a fallback, said in words.
    expect([cellOf(rowB!, "Tarefa"), cellOf(rowB!, "Fallback")]).toEqual(["—não informado", "Sem fallback"]);

    const metrics = screen.getByRole("table", { name: "Indicadores por agente" });
    const metricHeaders = within(metrics).getAllByRole("columnheader").map((cell) => cell.textContent);
    const metricCells = within(metrics).getAllByRole("cell").map((cell) => cell.textContent);
    expect(metricCells[metricHeaders.indexOf("Tarefa")]).toBe("tarefa-a");
    expect(metricCells[metricHeaders.indexOf("Fallbacks")]).toBe("2 (20%)");

    const usage = screen.getByRole("table", { name: "Uso e custo por modelo" });
    const usageHeaders = within(usage).getAllByRole("columnheader").map((cell) => cell.textContent);
    const usageCells = within(usage).getAllByRole("cell").map((cell) => cell.textContent);
    expect(usageCells[usageHeaders.indexOf("Falhas")]).toBe("3 (25%)");
    expect(usageCells[usageHeaders.indexOf("Fallbacks")]).toBe("2 (17%)");
    expect(usageCells[usageHeaders.indexOf("Duração média")]).toBe("0,8 s");
    await expectNoA11yViolations(container);
  });

  it("008/US6 008/FR-013 saúde mostra o circuito de cada configuração, com texto e ícone", async () => {
    serve({
      health: {
        ...HEALTH,
        modelConfigs: [...HEALTH.modelConfigs, { key: "cfg-c", provider: "prov", model: "modelo-c", status: "ENABLED", providerStatus: "UP", circuit: "HALF_OPEN" }],
      },
    });
    const { container } = renderPage();
    const table = await screen.findByRole("table", { name: "Saúde das configurações de modelo" });
    await within(table).findByText("cfg-c");
    const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    const column = headers.indexOf("Circuito");
    expect(column).toBeGreaterThan(-1);
    const circuits = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[column]!);
    expect(circuits.map((cell) => cell.textContent)).toEqual(["Aberto (sem chamadas)", "Fechado (normal)", "Em teste"]);
    for (const cell of circuits) expect(cell.querySelector("svg")).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it("mostra as 7 seções com dados, e as situações têm sempre texto e ícone", async () => {
    serve();
    const { container } = renderPage();
    for (const heading of ["Saúde", "Indicadores", "Uso e custo", "Tarefas", "Modelos", "Agentes", "Configurações de modelo"]) {
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
    serve({
      health: { ...HEALTH, modelConfigs: [] },
      metrics: { ...METRICS, byAgent: [], byModel: [], byTask: [], byTier: [], byFamily: [] },
      agents: [],
      "model-configs": [],
      models: [],
      tasks: [],
    });
    const { container } = renderPage();
    await waitFor(() => expect(screen.getAllByText("Nenhuma configuração de modelo registrada.")).toHaveLength(2));
    expect(await screen.findByText("Nenhuma execução no período.")).toBeTruthy();
    expect(screen.getByText("Nenhuma chamada ao modelo no período.")).toBeTruthy();
    expect(await screen.findByText("Nenhum agente registrado.")).toBeTruthy();
    expect(await screen.findByText("Nenhuma tarefa registrada.")).toBeTruthy();
    expect(await screen.findByText("Nenhum modelo no catálogo.")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  describe("009/US6 custo por tarefa, nível e família; seções Tarefas e Modelos", () => {
    const tableCells = (table: HTMLElement) => {
      const headers = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
      const rows = within(table).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
      return { headers, rows, at: (row: number, header: string) => rows[row]![headers.indexOf(header)] };
    };

    it("009/US6-1 009/US6-3 custo por tarefa (com fallbacks e escalonamentos), por nível e por família; escalonamentos por agente", async () => {
      serve();
      const { container } = renderPage();
      const byTask = tableCells(await screen.findByRole("table", { name: "Custo por tarefa" }));
      expect(byTask.at(0, "Tarefa")).toBe("tarefa-a");
      expect(byTask.at(0, "Agentes")).toBe("agente-a");
      expect(byTask.at(0, "Fallbacks")).toBe("2 (20%)");
      expect(byTask.at(0, "Escalonamentos")).toBe("1 (10%)");
      expect(byTask.at(0, "Custo estimado")).toBe("USD 0,125");

      const byTier = tableCells(screen.getByRole("table", { name: "Custo por nível" }));
      expect(byTier.rows.map((row) => row[0])).toEqual(["Básico", "Padrão", "—não informado"]);
      expect(byTier.at(1, "Custo estimado")).toBe("USD 0,025");

      const byFamily = tableCells(screen.getByRole("table", { name: "Custo por família" }));
      expect(byFamily.rows.map((row) => row[0])).toEqual(["anthropic", "openai"]);
      expect(byFamily.at(1, "Fallbacks")).toBe("2 (100%)");

      const metrics = tableCells(screen.getByRole("table", { name: "Indicadores por agente" }));
      expect(metrics.at(0, "Escalonamentos")).toBe("1 (10%)");
      const usage = tableCells(screen.getByRole("table", { name: "Uso e custo por modelo" }));
      expect([usage.at(0, "Nível"), usage.at(0, "Família")]).toEqual(["Básico", "anthropic"]);
      await expectNoA11yViolations(container);
    });

    it("Tarefas: política, escolha atual com o motivo em texto e ícone; indisponível e modelo descontinuado em uso como aviso", async () => {
      serve();
      const { container } = renderPage();
      const tasks = tableCells(await screen.findByRole("table", { name: "Tarefas e modelo escolhido" }));
      await waitFor(() => expect(tasks.rows).toHaveLength(3));
      expect(tasks.at(0, "Nível")).toBe("Básico (até Padrão)");
      expect(tasks.at(0, "Famílias")).toBe("anthropic, openai");
      expect(tasks.at(0, "Escalonamento")).toBe("Ao nível seguinte, se a saída for inválida");
      expect(tasks.at(0, "Modelo escolhido")).toBe("anthropic-basic (fallback: openai-basic)");
      expect(tasks.at(0, "Motivo")).toBe("Menor custo");
      expect(tasks.at(1, "Modelo escolhido")).toBe("Indisponível: sem modelo aprovado");
      expect(tasks.at(1, "Escalonamento")).toBe("Não escala");
      expect(tasks.at(2, "Motivo")).toBe("Só resta modelo descontinuado");
      const table = screen.getByRole("table", { name: "Tarefas e modelo escolhido" });
      for (const status of table.querySelectorAll('[data-slot="status"]')) expect(status.querySelector("svg")).not.toBeNull();
      await expectNoA11yViolations(container);
    });

    it("009/US6-2 Modelos: catálogo com nível, família, ciclo de vida e preço, e a qualidade de cada tarefa ao lado do custo médio por execução", async () => {
      serve();
      const { container } = renderPage();
      const catalog = tableCells(await screen.findByRole("table", { name: "Catálogo de modelos" }));
      await waitFor(() => expect(catalog.rows).toHaveLength(2));
      expect([catalog.at(0, "Nível"), catalog.at(0, "Família"), catalog.at(0, "Modo"), catalog.at(0, "Ciclo de vida")]).toEqual(["Básico", "anthropic", "Geração", "Produção"]);
      expect(catalog.at(0, "Preço por milhão de tokens")).toBe("USD 1 entrada / USD 5 saída");
      expect(catalog.at(1, "Preço por milhão de tokens")).toBe("Custo desconhecido");
      expect(catalog.at(1, "Ciclo de vida")).toBe("Candidato");

      const quality = tableCells(screen.getByRole("table", { name: "Qualidade e custo por tarefa" }));
      expect(quality.rows).toHaveLength(2);
      expect([quality.at(0, "Tarefa"), quality.at(0, "Modelo"), quality.at(0, "Aprovação")]).toEqual(["tarefa-a", "anthropic-basic", "Aprovado"]);
      expect(quality.at(0, "Qualidade medida")).toBe("itemRecall 0,96 · schemaValidity 1");
      expect(quality.at(0, "Custo médio por execução")).toBe("USD 0,0125");
      expect(quality.at(1, "Aprovação")).toBe("Abaixo dos limiares");
      expect(quality.at(1, "Custo médio por execução")).toBe("—não informado");
      await expectNoA11yViolations(container);
    });
  });

  it("o Select de período refaz a consulta com o novo período (métricas e catálogo)", async () => {
    serve();
    renderPage();
    await screen.findByText("Agente A");
    expect(calls("/ai/operations/metrics?period=7d")).toHaveLength(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Período" }));
    await user.click(await screen.findByRole("option", { name: "Últimos 30 dias" }));
    await waitFor(() => expect(calls("/ai/operations/metrics?period=30d")).toHaveLength(1));
    // 009/US6-2: the period also drives the real cost per execution of the catalog.
    await waitFor(() => expect(calls("/ai/operations/models?period=30d")).toHaveLength(1));
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
