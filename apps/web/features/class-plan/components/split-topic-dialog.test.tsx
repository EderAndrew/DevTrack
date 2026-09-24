import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { classPlanKeys } from "../hooks/use-class-plan";
import { SplitTopicDialog } from "./split-topic-dialog";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

const COVERAGE = coverageView([{ title: "SOLID", items: ["LSP", "ISP", "DIP"] }]);
const aula3 = meetingView("2027-03-18", 3);
const aula4 = meetingView("2027-03-25", 4);
const solid = topicView("SOLID: LSP, ISP e DIP", {
  meetingId: aula3.id,
  items: ["LSP", "ISP", "DIP"].map((text) => ({ id: COVERAGE.itemId(text), text, outsideRevision: false })),
});

describe("004/US6-3 SplitTopicDialog — dividir tópico (FR-037)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderDialog() {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(classPlanKeys.plan(CLASS_ID), envelope(planView({ revision: 4 })));
    const onSaved = vi.fn();
    renderWithProviders(
      <SplitTopicDialog
        classId={CLASS_ID}
        topic={solid}
        open
        onOpenChange={vi.fn()}
        meetings={[aula3, aula4]}
        groups={COVERAGE.groups}
        onSaved={onSaved}
      />,
      { queryClient },
    );
    return { onSaved, dialog: screen.getByRole("dialog", { name: "Dividir tópico" }) };
  }

  it("a primeira parte começa com o tópico; itens distribuídos, um item em duas partes; \"Tópico dividido.\"", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, planView()));
    const { dialog, onSaved } = renderDialog();

    const first = within(dialog).getByRole("group", { name: "Parte 1" });
    const second = within(dialog).getByRole("group", { name: "Parte 2" });
    expect((within(first).getByLabelText(/^Título/) as HTMLInputElement).value).toBe("SOLID: LSP, ISP e DIP");

    await user.clear(within(first).getByLabelText(/^Título/));
    await user.type(within(first).getByLabelText(/^Título/), "SOLID — LSP");
    await user.click(within(first).getByRole("checkbox", { name: "ISP" }));
    await user.click(within(first).getByRole("checkbox", { name: "DIP" }));
    await user.type(within(second).getByLabelText(/^Título/), "SOLID — ISP + DIP");
    await user.selectOptions(within(second).getByLabelText("Aula"), "Aula 04 — 25/03/2027");
    for (const item of ["ISP", "DIP", "LSP"]) await user.click(within(second).getByRole("checkbox", { name: item }));
    await user.click(within(dialog).getByRole("button", { name: "Dividir tópico" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Tópico dividido."));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`/api/classes/${CLASS_ID}/plan/topics/${solid.id}/split`);
    expect(JSON.parse(String(init!.body))).toEqual({
      planRevision: 4,
      parts: [
        { title: "SOLID — LSP", description: null, meetingId: aula3.id, itemIds: [COVERAGE.itemId("LSP")] },
        {
          title: "SOLID — ISP + DIP",
          description: null,
          meetingId: aula4.id,
          itemIds: ["ISP", "DIP", "LSP"].map((text) => COVERAGE.itemId(text)),
        },
      ],
    });
  });

  it("parte sem título: erro ligado ao campo, nada enviado; \"Adicionar parte\" e \"Remover parte 3\"", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await user.click(within(dialog).getByRole("button", { name: "Dividir tópico" }));
    expect(await within(dialog).findAllByText("Informe o título da parte 2.")).not.toHaveLength(0);
    const second = within(dialog).getByRole("group", { name: "Parte 2" });
    expect(within(second).getByLabelText(/^Título/).getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Adicionar parte" }));
    expect(within(dialog).getByRole("group", { name: "Parte 3" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Remover parte 3" }));
    expect(within(dialog).queryByRole("group", { name: "Parte 3" })).toBeNull();
  });

  it("004/SC-012 axe", async () => {
    renderDialog();
    await expectNoA11yViolations(document.body);
  });
});
