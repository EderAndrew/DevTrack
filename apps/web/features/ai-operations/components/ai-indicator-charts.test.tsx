import type { AiAgentMetrics, AiModelUsage } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { AiCostChart, AiExecutionsChart } from "./ai-indicator-charts";

const AGENT: AiAgentMetrics = {
  agentKey: "agente-a",
  agentVersion: 1,
  promptVersion: 1,
  provider: "prov",
  model: "modelo-a",
  taskKey: "tarefa-a",
  executions: 10,
  completed: 7,
  failed: 1,
  timedOut: 1,
  cancelled: 1,
  fallbacks: 0,
  escalations: 0,
  avgDurationMs: 1000,
  modelCalls: 10,
  toolCalls: 0,
  outputInvalid: 0,
  proposals: {
    created: 0,
    approved: 0,
    partiallyApproved: 0,
    rejected: 0,
    expired: 0,
  },
  avgTotalTokens: 100,
  avgEstimatedCost: "0.01",
  currency: "USD",
};
const MODEL: AiModelUsage = {
  provider: "prov",
  model: "modelo-a",
  tier: "BASIC",
  family: "anthropic",
  calls: 10,
  failedCalls: 0,
  fallbackCalls: 0,
  avgDurationMs: 800,
  inputTokens: 1000,
  outputTokens: 100,
  totalTokens: 1100,
  estimatedCost: "0.125000",
  currency: "USD",
};

/** The category labels on the chart's vertical axis, top to bottom. */
const axisCategories = (container: HTMLElement) =>
  [...container.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value")].map((tick) => tick.textContent);

describe("006 emenda 2026-10-22 gráficos de Indicadores", () => {
  // jsdom has no layout: the chart's container measures 640 × 200 so Recharts draws the bars.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 640,
      height: 200,
      top: 0,
      left: 0,
      right: 640,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  });
  afterEach(() => vi.restoreAllMocks());

  it("Execuções por agente: uma barra por agente, versões somadas, situações na legenda com ícone e nome", async () => {
    const { container } = renderWithProviders(
      <AiExecutionsChart
        rows={[
          AGENT,
          {
            ...AGENT,
            agentVersion: 2,
            completed: 3,
            failed: 2,
            timedOut: 0,
            cancelled: 0,
          },
          {
            ...AGENT,
            agentKey: "agente-b",
            completed: 0,
            failed: 0,
            timedOut: 0,
            cancelled: 4,
          },
        ]}
      />,
    );
    const figure = screen.getByRole("figure", { name: "Execuções por agente" });
    expect(within(figure).getByText("Os números de cada item estão na tabela abaixo.", { selector: "p" })).toBeTruthy();
    await waitFor(() => expect(axisCategories(container)).toEqual(["agente-a", "agente-b"]));
    const legend = within(figure).getAllByRole("listitem");
    expect(legend.map((item) => item.textContent)).toEqual(["Concluídas", "Falhas", "Tempo esgotado", "Canceladas"]);
    for (const item of legend) expect(item.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    // agente-a: 4 segments; agente-b: only "Canceladas" is drawn.
    expect(container.querySelectorAll(".recharts-bar-rectangle path").length).toBe(5);
    await expectNoA11yViolations(container);
  });

  it("Execuções por agente: nada sem execuções no período (a tabela mostra o estado vazio)", () => {
    const { container } = renderWithProviders(
      <AiExecutionsChart rows={[{ ...AGENT, completed: 0, failed: 0, timedOut: 0, cancelled: 0 }]} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("Custo estimado por modelo: o mais caro primeiro, uma série sem legenda, modelos sem custo de fora", async () => {
    const { container } = renderWithProviders(
      <AiCostChart
        rows={[
          MODEL,
          { ...MODEL, model: "modelo-b", estimatedCost: "0.500000" },
          {
            ...MODEL,
            model: "modelo-a",
            tier: "STANDARD",
            estimatedCost: "0.100000",
          },
          {
            ...MODEL,
            model: "modelo-sem-preco",
            estimatedCost: null,
            currency: null,
          },
        ]}
      />,
    );
    const figure = screen.getByRole("figure", {
      name: "Custo estimado por modelo",
    });
    await waitFor(() => expect(axisCategories(container)).toEqual(["modelo-b", "modelo-a"]));
    expect(within(figure).queryByRole("list")).toBeNull();
    expect(container.querySelectorAll(".recharts-bar-rectangle path").length).toBe(2);
    await expectNoA11yViolations(container);
  });

  it("Custo estimado por modelo: só a tabela quando os custos vêm em moedas diferentes ou não há custo", () => {
    const mixed = renderWithProviders(<AiCostChart rows={[MODEL, { ...MODEL, model: "modelo-b", currency: "BRL" }]} />);
    expect(mixed.container.innerHTML).toBe("");
    const none = renderWithProviders(<AiCostChart rows={[{ ...MODEL, estimatedCost: null, currency: null }]} />);
    expect(none.container.innerHTML).toBe("");
  });
});
