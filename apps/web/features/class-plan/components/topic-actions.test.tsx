import type { ClassPlanView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { ClassPlanPage } from "./class-plan-view";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

const CONFLICT = "O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar.";

describe("004/US6 ações dos tópicos no planejamento (FR-035, FR-038, FR-053)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const aula1 = meetingView("2027-03-04", 1, 0);
  const aula2 = meetingView("2027-03-11", 2, 0);
  /** Five topics without a meeting, so "Sem data" holds them all in order. */
  const titles = ["Introdução", "Classes", "Objetos", "Herança", "Polimorfismo"];
  const base = () =>
    planView({
      revision: 5,
      meetings: [aula1, aula2],
      topics: titles.map((title, index) => topicView(title, { position: index + 1 })),
    });

  const writes = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method && init.method !== "GET")
      .map(([url, init]) => ({ method: init!.method, url: String(url), body: JSON.parse(String(init!.body)) as Record<string, unknown> }));

  /**
   * GET …/plan answers `plan`; each write answers `respond(url, body)` and the answer becomes the
   * plan the next GET returns (like the API would).
   */
  function serve(initial: ClassPlanView, respond: (url: string, body: Record<string, unknown>) => Response | ClassPlanView) {
    let plan = initial;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method && init.method !== "GET") {
        const answer = respond(url, JSON.parse(String(init.body)));
        if (answer instanceof Response) return answer;
        plan = answer;
        return json(200, answer);
      }
      if (url.endsWith("/plan/coverage")) return json(200, coverageView([{ title: "POO", items: ["Herança"] }]));
      if (url.includes("/plan/topics?status=ARCHIVED")) {
        return json(200, { items: [topicView("Bibliotecas", { status: "ARCHIVED", position: 9 })] });
      }
      return json(200, envelope(plan));
    });
  }

  /** The plan with the topics in the order the reorder body sent. */
  const reordered = (plan: ClassPlanView, body: Record<string, unknown>): ClassPlanView => {
    const items = body.items as { topicId: string; meetingId: string | null }[];
    return {
      ...plan,
      revision: plan.revision + 1,
      topics: items.map((item, index) => ({ ...plan.topics.find((topic) => topic.id === item.topicId)!, position: index + 1, meetingId: item.meetingId })),
    };
  };

  it("004/US6-6 004/SC-012 \"Descer\" salva a ordem numa operação, mantém o foco no tópico movido e anuncia a posição", async () => {
    const user = userEvent.setup();
    const plan = base();
    serve(plan, (_url, body) => reordered(plan, body));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    const descer = await screen.findByRole("button", { name: "Descer Objetos" });
    descer.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("Tópico movido para a posição 4.")).toBeTruthy();
    expect(writes()).toEqual([
      {
        method: "PUT",
        url: `/api/classes/${CLASS_ID}/plan/topic-order`,
        body: {
          planRevision: 5,
          items: ["Introdução", "Classes", "Herança", "Objetos", "Polimorfismo"].map((title) => ({
            topicId: plan.topics.find((topic) => topic.title === title)!.id,
            meetingId: null,
          })),
        },
      },
    ]);
    const semData = screen.getByRole("region", { name: "Sem data" });
    expect(within(semData).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Introdução",
      "Classes",
      "Herança",
      "Objetos",
      "Polimorfismo",
    ]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Descer Objetos" })));
  });

  it("\"Subir\" no primeiro e \"Descer\" no último ficam desabilitados", async () => {
    serve(base(), () => base());
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);
    expect(((await screen.findByRole("button", { name: "Subir Introdução" })) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Descer Polimorfismo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("004/US6-6 o select Aula move o tópico para outra aula na mesma operação de ordem", async () => {
    const user = userEvent.setup();
    const plan = base();
    serve(plan, (_url, body) => reordered(plan, body));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.selectOptions(await screen.findByLabelText("Aula de Herança"), "Aula 02 — 11/03/2027");

    expect(await screen.findByText("Tópico movido para a Aula 02 — 11/03/2027.")).toBeTruthy();
    const body = writes()[0]!.body as { items: { topicId: string; meetingId: string | null }[] };
    expect(body.items.find((item) => item.topicId === plan.topics[3]!.id)!.meetingId).toBe(aula2.id);
    expect(within(screen.getByRole("region", { name: "Aula 02 — 11/03/2027" })).getByText("Herança")).toBeTruthy();
  });

  it("004/US6-5 \"Arquivar\" tira o tópico e \"Tópicos arquivados\" oferece \"Restaurar\"", async () => {
    const user = userEvent.setup();
    const plan = base();
    serve(plan, (url) =>
      url.endsWith("/archive")
        ? { ...plan, revision: 6, topics: plan.topics.filter((topic) => topic.title !== "Objetos"), archivedTopicCount: 1 }
        : { ...plan, revision: 7 },
    );
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Arquivar Objetos" }));
    expect(await screen.findByText("Tópico arquivado.")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 4, name: "Objetos" })).toBeNull();
    expect(writes()[0]).toMatchObject({ url: `/api/classes/${CLASS_ID}/plan/topics/${plan.topics[2]!.id}/archive`, body: { planRevision: 5 } });

    const archived = screen.getByRole("region", { name: "Tópicos arquivados" });
    await user.click(await within(archived).findByRole("button", { name: "Restaurar Bibliotecas" }));
    expect(await screen.findByText("Tópico restaurado.")).toBeTruthy();
    expect(writes()[1]!.url).toMatch(/\/restore$/);
    expect(writes()[1]!.body).toEqual({ planRevision: 6 });
  });

  it("004/US6-7 conflito 409: mensagem do catálogo e \"Atualizar\" busca o planejamento de novo", async () => {
    const user = userEvent.setup();
    serve(base(), () => apiError(409, "PLAN_REVISION_CONFLICT", "x"));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Arquivar Classes" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(CONFLICT);
    const gets = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === `/api/classes/${CLASS_ID}/plan` && (init?.method ?? "GET") === "GET").length;
    const before = gets();
    await user.click(within(alert).getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(gets()).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("\"Editar\" abre o formulário com os dados do tópico e salva com PATCH (\"Tópico salvo.\")", async () => {
    const user = userEvent.setup();
    const plan = base();
    serve(plan, () => ({ ...plan, revision: 6, topics: plan.topics.map((topic) => (topic.title === "Classes" ? { ...topic, title: "Classes e objetos" } : topic)) }));
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await user.click(await screen.findByRole("button", { name: "Editar Classes" }));
    const dialog = await screen.findByRole("dialog", { name: "Editar tópico" });
    const title = within(dialog).getByLabelText(/^Título/) as HTMLInputElement;
    expect(title.value).toBe("Classes");
    await user.clear(title);
    await user.type(title, "Classes e objetos");
    await user.click(within(dialog).getByRole("button", { name: "Salvar tópico" }));

    expect(await screen.findByText("Tópico salvo.")).toBeTruthy();
    expect(writes()[0]).toMatchObject({
      method: "PATCH",
      url: `/api/classes/${CLASS_ID}/plan/topics/${plan.topics[1]!.id}`,
      body: { planRevision: 5, title: "Classes e objetos", meetingId: null, itemIds: [] },
    });
  });

  it("004/FR-053 axe e ordem de tabulação das ações de um tópico", async () => {
    const user = userEvent.setup();
    serve(planView({ meetings: [aula1], topics: [topicView("Herança")] }), () => base());
    const { container } = renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    await screen.findByRole("button", { name: "Editar Herança" });
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Editar Herança" }),
      screen.getByLabelText("Aula de Herança"),
      screen.getByRole("button", { name: "Dividir Herança" }),
      screen.getByRole("button", { name: "Arquivar Herança" }),
      screen.getByRole("checkbox", { name: "Juntar Herança" }),
    ]);
    await expectNoA11yViolations(container);
  });

  it("sem planejamento.editar não há ações de tópico", async () => {
    serve(base(), () => base());
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit={false} />);
    await screen.findByRole("region", { name: "Sem data" });
    expect(screen.queryByRole("button", { name: /^Editar / })).toBeNull();
    expect(screen.queryByRole("button", { name: /Juntar tópicos/ })).toBeNull();
  });
});
