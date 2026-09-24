import type { SaveSyllabusRevisionRequest, SyllabusRevisionView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { SyllabusRevisionEditor } from "./syllabus-revision-editor";
import { revisionView } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000321";
const DOCUMENT_ID = "00000000-0000-4000-a000-000000000321";

const GROUPS = [
  { title: "Fundamentos", items: ["Classes", "Objetos", "Herança"] },
  { title: "Padrões", items: ["SOLID"] },
];

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const itemValues = (group: number) =>
  within(screen.getByRole("group", { name: `Grupo ${group}` }))
    .queryAllByLabelText(/^Item \d+ do grupo/)
    .map((element) => (element as HTMLInputElement).value);

describe("004/US3 004/FR-021 SyllabusRevisionEditor — revisão do conteúdo", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sent = (method: string) =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === method)
      .map(([url, init]) => ({ url: String(url), body: JSON.parse(String(init?.body)) as unknown }));

  /** The API answers a PUT with the content saved (new item ids) and a confirm with CONFIRMED. */
  const answerAsApi = (revision: SyllabusRevisionView) =>
    fetchMock.mockImplementation((_url, init) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as SaveSyllabusRevisionRequest;
        const saved = revisionView(
          revision.documentId,
          body.groups.map((group) => ({ title: group.title ?? null, items: group.items.map((item) => item.text) })),
          { id: revision.id, title: body.title ?? null, syllabusText: body.syllabusText ?? null, competencyText: body.competencyText ?? null },
        );
        return Promise.resolve(json(200, saved));
      }
      return Promise.resolve(json(200, { ...revision, status: "CONFIRMED", confirmedAt: "2026-09-23T16:00:00.000Z" }));
    });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const setup = (revision = revisionView(DOCUMENT_ID, GROUPS, { title: "POO", syllabusText: "Texto da ementa" })) => {
    answerAsApi(revision);
    const onConfirmed = vi.fn();
    const user = userEvent.setup();
    const view = renderWithProviders(<SyllabusRevisionEditor subjectId={SUBJECT_ID} revision={revision} onConfirmed={onConfirmed} />);
    return { ...view, user, onConfirmed, revision };
  };

  it("004/US3-1 campos Título, Ementa, Competência, grupos e itens preenchidos pela revisão; sem violações de axe", async () => {
    const { container } = setup();
    expect(input("Título").value).toBe("POO");
    expect((screen.getByLabelText("Ementa") as HTMLTextAreaElement).value).toBe("Texto da ementa");
    expect((screen.getByLabelText("Competência") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getAllByLabelText("Título do grupo").map((element) => (element as HTMLInputElement).value)).toEqual([
      "Fundamentos",
      "Padrões",
    ]);
    expect(itemValues(1)).toEqual(["Classes", "Objetos", "Herança"]);
    expect(itemValues(2)).toEqual(["SOLID"]);
    expect((screen.getByRole("button", { name: "Subir item 1 do grupo 1" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Descer item 3 do grupo 1" }) as HTMLButtonElement).disabled).toBe(true);
    await expectNoA11yViolations(container);
  });

  it("004/US3-2 Subir e Descer reordenam e mantêm o foco no item movido, anunciando a posição", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Descer item 1 do grupo 1" }));
    expect(itemValues(1)).toEqual(["Objetos", "Classes", "Herança"]);
    expect(document.activeElement).toBe(input("Item 2 do grupo 1"));
    expect(screen.getByText("Item movido para a posição 2.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Subir item 3 do grupo 1" }));
    expect(itemValues(1)).toEqual(["Objetos", "Herança", "Classes"]);
    expect(document.activeElement).toBe(input("Item 2 do grupo 1"));
    expect((document.activeElement as HTMLInputElement).value).toBe("Herança");
  });

  it("004/US3-2 \"Mover para o grupo…\" leva o item ao fim do outro grupo com o foco nele", async () => {
    const { user } = setup();
    // Opened with the keyboard (Enter), as a keyboard user would.
    screen.getByRole("combobox", { name: "Mover item 2 do grupo 1 para o grupo…" }).focus();
    await user.keyboard("{Enter}");
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Grupo 2 — Padrões"]);
    await user.click(screen.getByRole("option", { name: "Grupo 2 — Padrões" }));

    expect(itemValues(1)).toEqual(["Classes", "Herança"]);
    expect(itemValues(2)).toEqual(["SOLID", "Objetos"]);
    expect(document.activeElement).toBe(input("Item 2 do grupo 2"));
    expect(screen.getByText("Item movido para o grupo 2, posição 2.")).toBeTruthy();
  });

  it("004/US3-2 Remover, Adicionar item e Adicionar grupo levam o foco ao lugar certo", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Remover item 2 do grupo 1" }));
    expect(itemValues(1)).toEqual(["Classes", "Herança"]);
    expect(document.activeElement).toBe(input("Item 2 do grupo 1"));

    await user.click(screen.getByRole("button", { name: "Remover item 1 do grupo 2" }));
    expect(itemValues(2)).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Adicionar item ao grupo 2" }));

    await user.click(screen.getByRole("button", { name: "Adicionar item ao grupo 2" }));
    expect(document.activeElement).toBe(input("Item 1 do grupo 2"));
    await user.keyboard("Padrões de projeto");

    await user.click(screen.getByRole("button", { name: "Adicionar grupo" }));
    const titles = screen.getAllByLabelText("Título do grupo");
    expect(titles).toHaveLength(3);
    expect(document.activeElement).toBe(titles[2]);

    await user.click(screen.getByRole("button", { name: "Subir grupo 3" }));
    expect(document.activeElement).toBe(screen.getAllByLabelText("Título do grupo")[1]);
    await user.click(screen.getByRole("button", { name: "Remover grupo 2" }));
    expect(screen.getAllByLabelText("Título do grupo").map((element) => (element as HTMLInputElement).value)).toEqual([
      "Fundamentos",
      "Padrões",
    ]);
    expect(itemValues(2)).toEqual(["Padrões de projeto"]);
  });

  it("004/US3-2 Salvar envia o conteúdo com os ids dos itens e anuncia \"Revisão salva.\"", async () => {
    const { user, revision } = setup();
    await user.clear(input("Item 1 do grupo 1"));
    await user.type(input("Item 1 do grupo 1"), "Classes e objetos");
    await user.click(screen.getByRole("button", { name: "Remover item 2 do grupo 1" }));
    await user.click(screen.getByRole("button", { name: "Adicionar item ao grupo 2" }));
    await user.keyboard("Novo item");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Revisão salva.")).toBeTruthy();
    const [put] = sent("PUT");
    const [fundamentos, padroes] = revision.groups;
    expect(put).toEqual({
      url: `/api/syllabus-revisions/${revision.id}`,
      body: {
        title: "POO",
        syllabusText: "Texto da ementa",
        competencyText: null,
        groups: [
          {
            title: "Fundamentos",
            items: [
              { id: fundamentos!.items[0]!.id, text: "Classes e objetos" },
              { id: fundamentos!.items[2]!.id, text: "Herança" },
            ],
          },
          { title: "Padrões", items: [{ id: padroes!.items[0]!.id, text: "SOLID" }, { text: "Novo item" }] },
        ],
      },
    });
    expect(itemValues(2)).toEqual(["SOLID", "Novo item"]);
  });

  it("004/US3-3 confirmar sem itens: \"Inclua ao menos um item antes de confirmar.\" sem pedido", async () => {
    const { user } = setup(revisionView(DOCUMENT_ID, [], { source: "MANUAL" }));
    expect(screen.getByText(/Nenhum grupo/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar conteúdo" }));
    expect(screen.getByText("Inclua ao menos um item antes de confirmar.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("004/US3-3 Confirmar conteúdo pede confirmação, salva e confirma", async () => {
    const { user, revision, onConfirmed } = setup();
    await user.click(screen.getByRole("button", { name: "Confirmar conteúdo" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmar o conteúdo da ementa?" });
    expect(dialog.textContent).toContain("não pode mais ser alterado");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar conteúdo" }));

    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
      `PUT /api/syllabus-revisions/${revision.id}`,
      `POST /api/syllabus-revisions/${revision.id}/confirm`,
    ]);
    expect(onConfirmed.mock.calls[0]![0]).toMatchObject({ status: "CONFIRMED" });
  });

  it("item vazio: resumo de erros com link e campo marcado; nada é enviado", async () => {
    const { user } = setup();
    await user.clear(input("Item 3 do grupo 1"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível salvar a revisão" });
    expect(within(summary).getByRole("link", { name: "Grupo 1, item 3: Informe o texto do item." })).toBeTruthy();
    expectFieldErrorLinked(input("Item 3 do grupo 1"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erro da API aparece no resumo (REVISION_CONFIRMED)", async () => {
    const { user } = setup();
    fetchMock.mockResolvedValue(json(409, { statusCode: 409, code: "REVISION_CONFIRMED", message: "x" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Este conteúdo já foi confirmado e não pode ser alterado.")).toBeTruthy();
  });

  it("004/SC-012 teclado: Título, Ementa, Competência, grupos e itens, Adicionar grupo, Salvar, Confirmar conteúdo", async () => {
    const { user } = setup(revisionView(DOCUMENT_ID, [{ title: "Único", items: ["A"] }]));
    await expectTabOrder(user, [
      input("Título"),
      screen.getByLabelText("Ementa"),
      screen.getByLabelText("Competência"),
      input("Título do grupo"),
      screen.getByRole("button", { name: "Remover grupo 1" }),
      input("Item 1 do grupo 1"),
      screen.getByRole("button", { name: "Remover item 1 do grupo 1" }),
      screen.getByRole("button", { name: "Adicionar item ao grupo 1" }),
      screen.getByRole("button", { name: "Adicionar grupo" }),
      screen.getByRole("button", { name: "Salvar" }),
      screen.getByRole("button", { name: "Confirmar conteúdo" }),
    ]);
  });
});
