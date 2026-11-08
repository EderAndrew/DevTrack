import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { ClassPlanPage } from "./class-plan-view";
import { CoveragePanel } from "./coverage-panel";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

describe("004/US5 CoveragePanel — cobertura da ementa e atalhos de novo tópico", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const heranca = topicView("Herança");
  const polimorfismo = topicView("Polimorfismo");
  const coverage = coverageView(
    [
      { title: "Fundamentos", items: ["Encapsulamento, herança e polimorfismo", "Construtores"] },
      { title: null, items: ["Testes de unidade"] },
    ],
    { "Encapsulamento, herança e polimorfismo": [heranca.id, polimorfismo.id] },
  );

  it("004/US5-4 itens cobertos (por quais tópicos) e não cobertos, com a contagem", async () => {
    const onCreateFromItem = vi.fn();
    const { container } = renderWithProviders(
      <CoveragePanel coverage={coverage} topics={[heranca, polimorfismo]} canEdit onCreateFromItem={onCreateFromItem} />,
    );

    expect(screen.getByRole("heading", { name: "Cobertura da ementa" })).toBeTruthy();
    expect(screen.getByText("1 de 3 itens cobertos.")).toBeTruthy();
    const covered = screen.getByText("Encapsulamento, herança e polimorfismo").closest("li")!;
    expect(within(covered).getByText("Coberto por: Herança, Polimorfismo.")).toBeTruthy();
    expect(within(covered).queryByRole("button")).toBeNull();
    const uncovered = screen.getByText("Construtores").closest("li")!;
    expect(within(uncovered).getByText("Não coberto.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Itens" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("sem planejamento.editar, não oferece \"Criar tópico com este item\"", () => {
    renderWithProviders(<CoveragePanel coverage={coverage} topics={[]} canEdit={false} onCreateFromItem={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Criar tópico com este item/ })).toBeNull();
  });

  it("004/US5-3 \"Criar tópico com este item\" abre o formulário com o item marcado e o título preenchido, editável", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return json(201, planView());
      return String(url).endsWith("/plan/coverage") ? json(200, coverage) : json(200, envelope(planView({ revision: 4 })));
    });
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Criar tópico com este item: Construtores" }));

    const dialog = await screen.findByRole("dialog", { name: "Novo tópico" });
    const title = within(dialog).getByLabelText(/^Título/) as HTMLInputElement;
    expect(title.value).toBe("Construtores");
    expect((within(dialog).getByRole("checkbox", { name: "Construtores" }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByRole("checkbox", { name: "Testes de unidade" }) as HTMLInputElement).checked).toBe(false);

    await user.clear(title);
    await user.type(title, "Construtores e inicialização");
    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({
      planRevision: 4,
      title: "Construtores e inicialização",
      itemIds: [coverage.itemId("Construtores")],
    });
  });

  it("004/US5-7 \"Criar tópico com esta data\" só nas aulas sem tópico, abre o formulário com a aula escolhida, editável", async () => {
    const user = userEvent.setup();
    const aula1 = meetingView("2027-03-04", 1, 1);
    const aula2 = meetingView("2027-03-11", 2);
    const plan = planView({ revision: 4, meetings: [aula1, aula2], topics: [topicView("Classes", { meetingId: aula1.id })] });
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return json(201, plan);
      return String(url).endsWith("/plan/coverage") ? json(200, coverage) : json(200, envelope(plan));
    });
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Criar tópico com esta data: Aula 02 — 11/03/2027" }));
    expect(screen.queryByRole("button", { name: /Criar tópico com esta data: Aula 01/ })).toBeNull();

    const dialog = await screen.findByRole("dialog", { name: "Novo tópico" });
    const aula = within(dialog).getByLabelText("Aula") as HTMLSelectElement;
    expect(aula.value).toBe(aula2.id);
    await user.type(within(dialog).getByLabelText(/^Título/), "Construtores");
    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toMatchObject({ planRevision: 4, title: "Construtores", meetingId: aula2.id });
  });

  it("sem planejamento.editar, não oferece \"Criar tópico com esta data\"", async () => {
    const plan = planView({ meetings: [meetingView("2027-03-04", 1)] });
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/plan/coverage") ? json(200, coverage) : json(200, envelope(plan)),
    );
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit={false} />);

    expect(await screen.findByText("Nenhum tópico nesta aula.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Criar tópico com esta data/ })).toBeNull();
  });
});
