import type { ClassPlanEnvelope, PlanCoverage } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { ClassPlanPage } from "./class-plan-view";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

describe("004/US5 ClassPlanPage — planejamento da turma", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** GET …/plan answers `plan`, GET …/plan/coverage answers `coverage`. */
  function renderPage(plan: ClassPlanEnvelope, coverage: PlanCoverage = coverageView([]), canEdit = true) {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/plan/coverage") ? json(200, coverage) : json(200, plan),
    );
    return renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit={canEdit} />);
  }

  it("004/US5-2 sem ementa escolhida: pede a ementa confirmada, com link para a ementa da turma, e não oferece tópicos", async () => {
    const { container } = renderPage(envelope(null));

    expect(await screen.findByText("Envie e confirme a ementa antes de criar tópicos.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para a ementa da turma" }).getAttribute("href")).toBe(
      `/turmas/${CLASS_ID}/ementa`,
    );
    expect(screen.queryByRole("button", { name: "Novo tópico" })).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([`/api/classes/${CLASS_ID}/plan`]);
    await expectNoA11yViolations(container);
  });

  it("004/US5-5 encontros em ordem com seus tópicos, seção \"Sem data\" e \"Novo tópico\"", async () => {
    const aula1 = meetingView("2027-03-04", 1, 0);
    const aula5 = meetingView("2027-03-18", 5, 2);
    const plan = planView({
      meetings: [aula1, aula5],
      topics: [
        topicView("Classes, objetos e métodos", {
          position: 1,
          meetingId: aula5.id,
          items: [{ id: "00000000-0000-4000-8000-000000009001", text: "Conceitos de classes", outsideRevision: false }],
        }),
        topicView("Encapsulamento", { position: 2, meetingId: aula5.id }),
        topicView("Revisão geral", { position: 3 }),
        topicView("Exercícios", {
          position: 4,
          items: [{ id: "00000000-0000-4000-8000-000000009002", text: "Construtores", outsideRevision: true }],
        }),
      ],
    });
    const { container } = renderPage(envelope(plan));

    const aula05 = await screen.findByRole("region", { name: "Aula 05 — 18/03/2027" });
    expect(within(aula05).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Classes, objetos e métodos",
      "Encapsulamento",
    ]);
    expect(within(aula05).getByText("Conceitos de classes")).toBeTruthy();
    const aula01 = screen.getByRole("region", { name: "Aula 01 — 04/03/2027" });
    expect(within(aula01).getByText("Nenhum tópico nesta aula.")).toBeTruthy();

    const semData = screen.getByRole("region", { name: "Sem data" });
    expect(within(semData).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Revisão geral",
      "Exercícios",
    ]);
    expect(within(semData).getByText(/Este item não existe na versão da ementa usada agora\./)).toBeTruthy();

    expect(screen.getByRole("button", { name: "Novo tópico" })).toBeTruthy();
    expect(screen.getByText("Ementa usada: versão 2, revisão 1.")).toBeTruthy();
    expect(screen.getByText("Situação: Rascunho")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("sem planejamento.editar ou com o planejamento arquivado: somente leitura", async () => {
    renderPage(envelope(planView({ status: "ARCHIVED" })));
    expect(await screen.findByText("Situação: Arquivado")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Novo tópico" })).toBeNull();
  });

  it("\"Novo tópico\" abre o formulário; ao criar, anuncia \"Tópico criado.\" e mostra o tópico", async () => {
    const user = userEvent.setup();
    const plan = planView();
    const created = planView({ ...plan, revision: plan.revision + 1, topics: [topicView("Herança", { position: 1 })] });
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return json(201, created);
      return String(url).endsWith("/plan/coverage") ? json(200, coverageView([])) : json(200, envelope(plan));
    });
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Novo tópico" }));
    const dialog = await screen.findByRole("dialog", { name: "Novo tópico" });
    await user.type(within(dialog).getByLabelText(/^Título/), "Herança");
    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    expect(await screen.findByText("Tópico criado.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Sem data" })).getByText("Herança")).toBeTruthy();
  });
});
