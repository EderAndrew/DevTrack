import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { classPlanKeys } from "../hooks/use-class-plan";
import { TopicFormDialog, type TopicFormDialogProps } from "./topic-form-dialog";
import { CLASS_ID, coverageView, envelope, meetingView, planView, topicView } from "./test-fixtures";

const COVERAGE = coverageView([
  { title: "Fundamentos", items: ["Conceitos de classes, objetos e métodos", "Construtores"] },
  { title: "Práticas", items: ["Padrões de projeto", "Testes de unidade"] },
]);
const MEETINGS = [meetingView("2027-03-04", 1), meetingView("2027-03-11", 2)];

describe("004/US5 TopicFormDialog — formulário de tópico", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const postBodies = () =>
    fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init!.body)));

  function renderDialog(props: Partial<TopicFormDialogProps> = {}) {
    const queryClient = makeTestQueryClient();
    const plan = planView({ meetings: MEETINGS, revision: 7 });
    queryClient.setQueryData(classPlanKeys.plan(CLASS_ID), envelope(plan));
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <TopicFormDialog
        classId={CLASS_ID}
        open
        onOpenChange={onOpenChange}
        meetings={MEETINGS}
        groups={COVERAGE.groups}
        onSaved={onSaved}
        {...props}
      />,
      { queryClient },
    );
    return { plan, onSaved, onOpenChange, dialog: screen.getByRole("dialog", { name: "Novo tópico" }) };
  }

  it("004/US5-1 Título, Descrição, Aula (com \"Sem data\") e itens por grupo; envia os campos com o planRevision do cache", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(201, planView({ topics: [topicView("Classes, objetos e métodos")] })));
    const { dialog, onSaved, onOpenChange } = renderDialog();

    const aula = within(dialog).getByLabelText("Aula") as HTMLSelectElement;
    expect([...aula.options].map((option) => option.textContent)).toEqual([
      "Sem data",
      "Aula 01 — 04/03/2027",
      "Aula 02 — 11/03/2027",
    ]);
    expect(within(dialog).getByRole("group", { name: "Fundamentos" })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: "Práticas" })).toBeTruthy();

    await user.type(within(dialog).getByLabelText(/^Título/), "Classes, objetos e métodos");
    await user.type(within(dialog).getByLabelText("Descrição"), "Primeiros passos.");
    await user.selectOptions(aula, "Aula 02 — 11/03/2027");
    await user.click(within(dialog).getByRole("checkbox", { name: "Conceitos de classes, objetos e métodos" }));
    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("Tópico criado."));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS_ID}/plan/topics`);
    expect(postBodies()).toEqual([
      {
        planRevision: 7,
        title: "Classes, objetos e métodos",
        description: "Primeiros passos.",
        meetingId: MEETINGS[1]!.id,
        itemIds: [COVERAGE.itemId("Conceitos de classes, objetos e métodos")],
      },
    ]);
  });

  it("a busca filtra os itens e mantém os já marcados", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await user.click(within(dialog).getByRole("checkbox", { name: "Construtores" }));
    await user.type(within(dialog).getByLabelText("Buscar item da ementa"), "padroes");

    expect(within(dialog).getAllByRole("checkbox").map((box) => box.getAttribute("aria-label") ?? box.id)).toHaveLength(1);
    expect(within(dialog).getByRole("checkbox", { name: "Padrões de projeto" })).toBeTruthy();
    expect(within(dialog).getByText("1 item marcado.")).toBeTruthy();

    await user.clear(within(dialog).getByLabelText("Buscar item da ementa"));
    expect((within(dialog).getByRole("checkbox", { name: "Construtores" }) as HTMLInputElement).checked).toBe(true);
  });

  it("título vazio: erro ligado ao campo, nada enviado", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    expect(await within(dialog).findByText("Informe o título do tópico.", { selector: "p" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/^Título/).getAttribute("aria-invalid")).toBe("true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("SYLLABUS_ITEM_NOT_IN_PLAN → \"Este item não existe na versão da ementa usada agora.\"", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      apiError(422, "SYLLABUS_ITEM_NOT_IN_PLAN", "Este item não existe na versão da ementa usada agora."),
    );
    const { dialog, onSaved } = renderDialog();

    await user.type(within(dialog).getByLabelText(/^Título/), "Construtores");
    await user.click(within(dialog).getByRole("checkbox", { name: "Construtores" }));
    await user.click(within(dialog).getByRole("button", { name: "Criar tópico" }));

    expect(await within(dialog).findAllByText("Este item não existe na versão da ementa usada agora.")).not.toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("004/US5-3 abre com o item escolhido e o título preenchido, editáveis", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog({
      initial: { title: "Testes de unidade", itemIds: [COVERAGE.itemId("Testes de unidade")] },
    });

    const title = within(dialog).getByLabelText(/^Título/) as HTMLInputElement;
    expect(title.value).toBe("Testes de unidade");
    const box = within(dialog).getByRole("checkbox", { name: "Testes de unidade" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await user.clear(title);
    await user.type(title, "Testes automatizados");
    await user.click(box);
    expect(box.checked).toBe(false);
  });

  it("SC-012 teclado e axe: Título → Descrição → Aula → Buscar → itens → Criar tópico", async () => {
    const user = userEvent.setup();
    const { dialog } = renderDialog();

    await expectTabOrder(user, [
      within(dialog).getByLabelText(/^Título/),
      within(dialog).getByLabelText("Descrição"),
      within(dialog).getByLabelText("Aula"),
      within(dialog).getByLabelText("Buscar item da ementa"),
      within(dialog).getByRole("checkbox", { name: "Conceitos de classes, objetos e métodos" }),
      within(dialog).getByRole("checkbox", { name: "Testes de unidade" }),
      within(dialog).getByRole("button", { name: "Criar tópico" }),
    ]);
    await expectNoA11yViolations(document.body);
  });
});
