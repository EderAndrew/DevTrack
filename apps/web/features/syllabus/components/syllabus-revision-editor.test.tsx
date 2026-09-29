import type { SaveSyllabusRevisionRequest, SyllabusRevisionView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { SyllabusRevisionEditor } from "./syllabus-revision-editor";
import { SyllabusVersionsList } from "./syllabus-versions-list";
import { documentView, revisionView } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000321";
const DOCUMENT_ID = "00000000-0000-4000-a000-000000000321";

const GROUPS = [
  { title: "Fundamentos", items: ["Classes", "Objetos", "Herança"] },
  { title: "Padrões", items: ["SOLID"] },
];

/** The catalog the "Linguagem" select offers (010). */
const LANGUAGES = [
  { id: "00000000-0000-4000-b000-000000000001", key: "java", name: "Java" },
  { id: "00000000-0000-4000-b000-000000000002", key: "python", name: "Python" },
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

  /** Calls that write (the catalog GET of the "Linguagem" select is not one). */
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== "GET");

  /** The API answers a PUT with the content saved (new item ids) and a confirm with CONFIRMED. */
  const answerAsApi = (revision: SyllabusRevisionView) =>
    fetchMock.mockImplementation((url, init) => {
      if (String(url) === "/api/programming-languages") return Promise.resolve(json(200, LANGUAGES));
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
        languageId: null,
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

  it("010/US7-1 010/FR-039 Linguagem: vem com a da revisão (ou Nenhuma), lista o catálogo e é enviada no Salvar", async () => {
    const { user, revision } = setup(revisionView(DOCUMENT_ID, GROUPS, { title: "POO", language: { id: LANGUAGES[1]!.id, name: "Python" } }));
    const select = screen.getByLabelText(/^Linguagem/) as HTMLSelectElement;
    await vi.waitFor(() => expect([...select.options].map((option) => option.text)).toEqual(["Nenhuma", "Java", "Python"]));
    expect(select.value).toBe(LANGUAGES[1]!.id);

    await user.selectOptions(select, "Java");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(sent("PUT")).toHaveLength(1));
    expect(sent("PUT")[0]!.body).toMatchObject({ languageId: LANGUAGES[0]!.id });

    await user.selectOptions(select, "Nenhuma");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await vi.waitFor(() => expect(sent("PUT")).toHaveLength(2));
    expect(sent("PUT")[1]!.body).toMatchObject({ languageId: null });
    expect(revision.status).toBe("DRAFT");
  });

  it("uma linguagem desativada depois de escolhida continua na lista do rascunho que a tem", async () => {
    setup(revisionView(DOCUMENT_ID, GROUPS, { language: { id: "00000000-0000-4000-b000-000000000009", name: "Rust" } }));
    const select = screen.getByLabelText(/^Linguagem/) as HTMLSelectElement;
    await vi.waitFor(() => expect([...select.options].map((option) => option.text)).toEqual(["Nenhuma", "Java", "Python", "Rust"]));
    expect(select.value).toBe("00000000-0000-4000-b000-000000000009");
  });

  it("004/US3-3 confirmar sem itens: \"Inclua ao menos um item antes de confirmar.\" sem pedido", async () => {
    const { user } = setup(revisionView(DOCUMENT_ID, [], { source: "MANUAL" }));
    expect(screen.getByText(/Nenhum grupo/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar conteúdo" }));
    expect(screen.getByText("Inclua ao menos um item antes de confirmar.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("004/US3-3 Confirmar conteúdo pede confirmação, salva e confirma", async () => {
    const { user, revision, onConfirmed } = setup();
    await user.click(screen.getByRole("button", { name: "Confirmar conteúdo" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Confirmar o conteúdo da ementa?" });
    expect(dialog.textContent).toContain("não pode mais ser alterado");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar conteúdo" }));

    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
    expect(writes().map(([url, init]) => `${init?.method} ${String(url)}`)).toEqual([
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
    expect(writes()).toEqual([]);
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
      screen.getByLabelText(/^Linguagem/),
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

describe("007/US3 rascunho preenchido com IA no editor e na lista de versões da 004", () => {
  const PROPOSAL_ID = "5b1d7c2e-8a38-4c55-9d0b-2a4f5c0f6b22";
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("007/US3-5 AI_ASSISTED: aviso \"Preenchido com IA\" com o link \"Ver proposta\", sem mudar o editor", async () => {
    const revision = revisionView(DOCUMENT_ID, GROUPS, { title: "POO", source: "AI_ASSISTED", aiProposalId: PROPOSAL_ID });
    const { container } = renderWithProviders(<SyllabusRevisionEditor subjectId={SUBJECT_ID} revision={revision} />);

    expect(screen.getByText(/Preenchido com IA — revise o conteúdo antes de confirmar\./)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Ver proposta" });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${SUBJECT_ID}/ementa/${DOCUMENT_ID}/proposta/${PROPOSAL_ID}`);
    expect(input("Título").value).toBe("POO");
    expect(screen.getByRole("button", { name: "Confirmar conteúdo" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("outras origens não mostram o aviso", () => {
    renderWithProviders(<SyllabusRevisionEditor subjectId={SUBJECT_ID} revision={revisionView(DOCUMENT_ID, GROUPS, { source: "MANUAL" })} />);
    expect(screen.queryByText(/Preenchido com IA/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Ver proposta" })).toBeNull();
  });

  it("a lista de versões rotula a revisão confirmada AI_ASSISTED como \"Preenchido com IA\"", async () => {
    const ai = documentView(SUBJECT_ID, { version: 2, confirmedRevision: { id: PROPOSAL_ID, number: 2, source: "AI_ASSISTED" } });
    const manual = documentView(SUBJECT_ID, { version: 1, confirmedRevision: { id: DOCUMENT_ID, number: 1, source: "MANUAL" } });
    fetchMock.mockResolvedValue(json(200, { items: [ai, manual] }));
    renderWithProviders(<SyllabusVersionsList subjectId={SUBJECT_ID} />);

    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getByText("Confirmado (revisão 2) — Preenchido com IA")).toBeTruthy();
    expect(within(rows[2]!).getByText("Confirmado (revisão 1)")).toBeTruthy();
  });
});
