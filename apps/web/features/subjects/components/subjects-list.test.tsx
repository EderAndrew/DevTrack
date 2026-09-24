import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { SubjectsList } from "./subjects-list";
import { apiError, json, subjectView } from "./test-fixtures";

describe("004/US1-1 SubjectsList — pesquisa, filtro e paginação (FR-001)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista as disciplinas com situação, turmas, versões e link, e oferece Nova disciplina", async () => {
    const poo = subjectView("Programação Orientada a Objetos", { classCount: 2, documentCount: 1 });
    const bd = subjectView("Banco de Dados", { status: "INACTIVE" });
    fetchMock.mockResolvedValueOnce(json(200, { items: [poo, bd], nextCursor: null }));
    const { container } = renderWithProviders(<SubjectsList canCreate />);

    const link = await screen.findByRole("link", { name: poo.name });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${poo.id}`);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/subjects");
    const row = link.closest("tr")!;
    expect(within(row).getByText("Ativa")).toBeTruthy();
    expect(within(row).getByText("2")).toBeTruthy();
    expect(within(row).getByText("1")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: bd.name }).closest("tr")!).getByText("Inativa")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nova disciplina" }).getAttribute("href")).toBe("/disciplinas/nova");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("vazio e sem permissão de criar", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<SubjectsList canCreate={false} />);
    expect(await screen.findByText("Nenhuma disciplina encontrada.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Nova disciplina" })).toBeNull();
  });

  it("pesquisa e filtra no servidor e carrega mais com o cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }))
      .mockResolvedValueOnce(json(200, { items: [subjectView("Algoritmos")], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [subjectView("Algoritmos II")], nextCursor: null }));
    renderWithProviders(<SubjectsList canCreate />);
    const user = userEvent.setup();
    await screen.findByText("Nenhuma disciplina encontrada.");

    await user.type(screen.getByLabelText("Pesquisar por nome"), " algorítmos ");
    await user.click(screen.getByRole("combobox", { name: "Situação" }));
    await user.click(await screen.findByRole("option", { name: "Inativa" }));
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));

    expect(await screen.findByRole("link", { name: "Algoritmos" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/subjects?query=${encodeURIComponent("algorítmos")}&status=INACTIVE`);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("link", { name: "Algoritmos II" })).toBeTruthy();
    expect(fetchMock.mock.calls[2]![0]).toBe(
      `/api/subjects?query=${encodeURIComponent("algorítmos")}&status=INACTIVE&cursor=c1`,
    );
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("erro de carregamento com Tentar novamente", async () => {
    fetchMock
      .mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro interno."))
      .mockResolvedValueOnce(json(200, { items: [subjectView("Redes")], nextCursor: null }));
    const { container } = renderWithProviders(<SubjectsList canCreate />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toBe("");
    await expectNoA11yViolations(container);
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: "Redes" })).toBeTruthy();
  });

  it("carregando: indicador com aria-busy", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    renderWithProviders(<SubjectsList canCreate />);
    expect(screen.getByText("Carregando disciplinas…").closest('[aria-busy="true"]')).not.toBeNull();
  });
});

describe("004/SC-012 — SubjectsList só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação e pesquisa com Enter", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [subjectView("Compiladores")], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<SubjectsList canCreate />);
    const user = userEvent.setup();
    const link = await screen.findByRole("link", { name: "Compiladores" });

    const search = screen.getByLabelText("Pesquisar por nome");
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Nova disciplina" }),
      search,
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByRole("button", { name: "Pesquisar" }),
      link,
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);

    await tabTo(user, search);
    await user.keyboard("redes{Enter}");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/subjects?query=redes");
  });
});
