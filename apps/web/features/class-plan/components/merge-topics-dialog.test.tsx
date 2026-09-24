import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { classPlanKeys } from "../hooks/use-class-plan";
import { ClassPlanPage } from "./class-plan-view";
import { MergeTopicsDialog } from "./merge-topics-dialog";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

const COVERAGE = coverageView([{ title: "POO", items: ["Herança", "Modificadores de acesso", "Interfaces"] }]);
const aula5 = meetingView("2027-04-01", 5);
const aula6 = meetingView("2027-04-08", 6);
const heranca = topicView("Herança", {
  meetingId: aula5.id,
  description: "Classe base e derivada.",
  items: [{ id: COVERAGE.itemId("Herança"), text: "Herança", outsideRevision: false }],
});
const modificadores = topicView("Modificadores de acesso", {
  position: 2,
  meetingId: aula6.id,
  items: [{ id: COVERAGE.itemId("Modificadores de acesso"), text: "Modificadores de acesso", outsideRevision: false }],
});

describe("004/US6-2 MergeTopicsDialog — juntar tópicos (FR-036)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderDialog() {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(classPlanKeys.plan(CLASS_ID), envelope(planView({ revision: 8, meetings: [aula5, aula6] })));
    const onSaved = vi.fn();
    renderWithProviders(
      <MergeTopicsDialog
        classId={CLASS_ID}
        open
        onOpenChange={vi.fn()}
        meetings={[aula5, aula6]}
        groups={COVERAGE.groups}
        topics={[heranca, modificadores]}
        onSaved={onSaved}
      />,
      { queryClient },
    );
    return { onSaved, dialog: screen.getByRole("dialog", { name: "Juntar tópicos" }) };
  }

  it("título, descrição, aula do primeiro e a união dos itens, revisáveis; envia os ids com o primeiro primeiro", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, planView()));
    const { dialog, onSaved } = renderDialog();

    expect(within(dialog).getByText(/Fica o tópico “Herança”/)).toBeTruthy();
    const title = within(dialog).getByLabelText(/^Título/) as HTMLInputElement;
    expect(title.value).toBe("Herança + Modificadores de acesso");
    expect((within(dialog).getByLabelText("Descrição") as HTMLTextAreaElement).value).toBe("Classe base e derivada.");
    expect((within(dialog).getByLabelText("Aula") as HTMLSelectElement).value).toBe(aula5.id);
    const checked = within(dialog)
      .getAllByRole("checkbox")
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.id);
    expect(checked).toHaveLength(2);

    await user.clear(title);
    await user.type(title, "Herança + Modificadores de Acesso");
    await user.click(within(dialog).getByRole("checkbox", { name: "Interfaces" }));
    await user.click(within(dialog).getByRole("button", { name: "Juntar tópicos" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Tópicos juntados."));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/classes/${CLASS_ID}/plan/topics/merge`);
    expect(JSON.parse(String(init!.body))).toEqual({
      planRevision: 8,
      topicIds: [heranca.id, modificadores.id],
      title: "Herança + Modificadores de Acesso",
      description: "Classe base e derivada.",
      meetingId: aula5.id,
      itemIds: [COVERAGE.itemId("Herança"), COVERAGE.itemId("Modificadores de acesso"), COVERAGE.itemId("Interfaces")],
    });
  });

  it("004/US6-7 conflito: mensagem, \"Atualizar\" e o formulário continua aberto com o que foi digitado", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === "POST" ? apiError(409, "PLAN_REVISION_CONFLICT", "x") : json(200, envelope(planView({ revision: 9 }))),
    );
    const { dialog, onSaved } = renderDialog();
    const title = within(dialog).getByLabelText(/^Título/) as HTMLInputElement;
    await user.clear(title);
    await user.type(title, "Meu título");
    await user.click(within(dialog).getByRole("button", { name: "Juntar tópicos" }));

    expect(
      await within(dialog).findAllByText("O planejamento foi alterado depois que você o abriu. Atualize a página antes de continuar."),
    ).not.toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Atualizar" }));
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: "Atualizar" })).toBeNull());
    expect(title.value).toBe("Meu título");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("004/SC-012 teclado e axe", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();
    await expectTabOrder(user, [
      within(dialog).getByLabelText(/^Título/),
      within(dialog).getByLabelText("Descrição"),
      within(dialog).getByLabelText("Aula"),
      within(dialog).getByLabelText("Buscar item da ementa"),
      within(dialog).getByRole("button", { name: "Juntar tópicos" }),
    ]);
    await expectNoA11yViolations(document.body);
  });

  it("na página: a seleção \"Juntar\" de dois tópicos habilita \"Juntar tópicos (2)\"", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/coverage") ? json(200, COVERAGE) : json(200, envelope(planView({ meetings: [aula5, aula6], topics: [heranca, modificadores] }))),
    );
    renderWithProviders(<ClassPlanPage classId={CLASS_ID} canEdit />);

    const merge = await screen.findByRole("button", { name: "Juntar tópicos (0)" });
    expect((merge as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Juntar Modificadores de acesso" }));
    await user.click(screen.getByRole("checkbox", { name: "Juntar Herança" }));
    await user.click(screen.getByRole("button", { name: "Juntar tópicos (2)" }));

    const dialog = await screen.findByRole("dialog", { name: "Juntar tópicos" });
    // Plan order, whatever the order of selection: "Herança" stays.
    expect(within(dialog).getByText(/Fica o tópico “Herança”/)).toBeTruthy();
  });
});
