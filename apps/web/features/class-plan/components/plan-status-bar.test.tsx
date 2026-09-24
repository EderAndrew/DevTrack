import type { ClassPlanStatus } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { classPlanKeys } from "../hooks/use-class-plan";
import { ClassPlanPage } from "./class-plan-view";
import { PlanStatusBar } from "./plan-status-bar";
import { CLASS_ID, coverageView, envelope, planView, topicView } from "./test-fixtures";

describe("004/US7 PlanStatusBar — situação do planejamento (FR-031)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const posts = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url, init]) => [String(url), JSON.parse(String(init!.body))]);

  function renderBar(status: ClassPlanStatus, canChange = true) {
    const plan = planView({ status, revision: 3 });
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(classPlanKeys.plan(CLASS_ID), envelope(plan));
    return { plan, ...renderWithProviders(<PlanStatusBar classId={CLASS_ID} plan={plan} canChange={canChange} />, { queryClient }) };
  }

  it.each([
    ["DRAFT", "Rascunho", ["Confirmar planejamento", "Arquivar planejamento"]],
    ["READY", "Pronto", ["Reabrir", "Iniciar", "Arquivar planejamento"]],
    ["ACTIVE", "Em andamento", ["Arquivar planejamento"]],
  ] as const)("%s: situação \"%s\" e as ações possíveis", async (status, label, actions) => {
    const { container } = renderBar(status);
    expect(screen.getByText(`Situação: ${label}`)).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(actions);
    await expectNoA11yViolations(container);
  });

  it("004/US7-1 \"Confirmar planejamento\" envia CONFIRM com o planRevision e anuncia \"Planejamento confirmado.\"", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, planView({ status: "READY", revision: 4 })));
    renderBar("DRAFT");

    await user.click(screen.getByRole("button", { name: "Confirmar planejamento" }));

    expect(await screen.findByText("Planejamento confirmado.")).toBeTruthy();
    expect(posts()).toEqual([[`/api/classes/${CLASS_ID}/plan/status`, { planRevision: 3, action: "CONFIRM" }]]);
  });

  it("004/US7-2 sem tópicos: \"Crie ao menos um tópico antes de confirmar.\"", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(apiError(422, "PLAN_HAS_NO_TOPICS", "x"));
    renderBar("DRAFT");

    await user.click(screen.getByRole("button", { name: "Confirmar planejamento" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Crie ao menos um tópico antes de confirmar.");
  });

  it("004/US7-6 \"Arquivar planejamento\" pede confirmação num alert-dialog antes de enviar ARCHIVE", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, planView({ status: "ARCHIVED", revision: 4 })));
    renderBar("ACTIVE");

    await user.click(screen.getByRole("button", { name: "Arquivar planejamento" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Arquivar o planejamento?" });
    expect(posts()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Arquivar planejamento" }));

    expect(await screen.findByText("Planejamento arquivado.")).toBeTruthy();
    expect(posts()).toEqual([[`/api/classes/${CLASS_ID}/plan/status`, { planRevision: 3, action: "ARCHIVE" }]]);
  });

  it("004/US7-6 arquivado: aviso de somente leitura, sem ações; sem planejamento.alterar_situacao, sem ações", () => {
    const { unmount } = renderBar("ARCHIVED");
    expect(screen.getByText("Este planejamento está arquivado e não pode ser alterado.")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
    unmount();

    renderBar("READY", false);
    expect(screen.getByText("Situação: Pronto")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("004/SC-012 teclado: Reabrir → Iniciar → Arquivar planejamento", async () => {
    const user = userEvent.setup();
    renderBar("READY");
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Reabrir" }),
      screen.getByRole("button", { name: "Iniciar" }),
      screen.getByRole("button", { name: "Arquivar planejamento" }),
    ]);
  });

  it("004/US7-6 na página, planejamento arquivado esconde as ações de edição dos tópicos", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/coverage")
        ? json(200, coverageView([{ title: "POO", items: ["Classes"] }]))
        : json(200, envelope(planView({ status: "ARCHIVED", topics: [topicView("Classes")] }))),
    );
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit canChangeStatus />);

    expect(await screen.findByText("Este planejamento está arquivado e não pode ser alterado.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Cobertura da ementa" })).toBeTruthy());
    for (const name of [/^Novo tópico/, /^Editar /, /^Arquivar /, /^Juntar tópicos/, /Criar tópico com este item/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});
