import type { ClassView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ClassesList } from "./classes-list";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

let sequence = 0;
const schoolClass = (name: string, overrides: Partial<ClassView> = {}): ClassView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    name,
    code: `T-${sequence}`,
    academicYear: 2026,
    period: null,
    description: null,
    status: "ACTIVE",
    activeStudentCount: 0,
    createdAt: "2026-09-21T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
    ...overrides,
  };
};

describe("003/US1-2 ClassesList — pesquisa, filtros e paginação (FR-007)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista as turmas com situação, alunos e link, e oferece Nova turma", async () => {
    const poo = schoolClass("Programação Orientada a Objetos", { period: "2º semestre", activeStudentCount: 12 });
    const bd = schoolClass("Banco de Dados", { status: "INACTIVE" });
    fetchMock.mockResolvedValueOnce(json(200, { items: [poo, bd], nextCursor: null }));
    const { container } = renderWithProviders(<ClassesList canCreate />);

    const link = await screen.findByRole("link", { name: poo.name });
    expect(link.getAttribute("href")).toBe(`/turmas/${poo.id}`);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/classes");
    const row = link.closest("tr")!;
    expect(within(row).getByText("Ativa")).toBeTruthy();
    expect(within(row).getByText("12")).toBeTruthy();
    expect(within(row).getByText("2º semestre")).toBeTruthy();
    expect(within(screen.getByRole("link", { name: bd.name }).closest("tr")!).getByText("Inativa")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nova turma" }).getAttribute("href")).toBe("/turmas/nova");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("sem permissão de criar não mostra Nova turma", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<ClassesList canCreate={false} />);
    expect(await screen.findByText("Nenhuma turma encontrada.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Nova turma" })).toBeNull();
  });

  it("pesquisa com ano e situação no servidor e carrega mais com o cursor", async () => {
    const first = schoolClass("Algoritmos");
    const second = schoolClass("Algoritmos II");
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }))
      .mockResolvedValueOnce(json(200, { items: [first], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [second], nextCursor: null }));
    renderWithProviders(<ClassesList canCreate />);
    const user = userEvent.setup();
    await screen.findByText("Nenhuma turma encontrada.");

    await user.type(screen.getByLabelText("Pesquisar por nome ou código"), " algorítmos ");
    await user.type(screen.getByLabelText("Ano letivo"), "2026");
    await user.click(screen.getByRole("combobox", { name: "Situação" }));
    await user.click(await screen.findByRole("option", { name: "Arquivada" }));
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));

    expect(await screen.findByRole("link", { name: "Algoritmos" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes?query=${encodeURIComponent("algorítmos")}&year=2026&status=ARCHIVED`);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("link", { name: "Algoritmos II" })).toBeTruthy();
    expect(fetchMock.mock.calls[2]![0]).toBe(
      `/api/classes?query=${encodeURIComponent("algorítmos")}&year=2026&status=ARCHIVED&cursor=c1`,
    );
    expect(screen.getByRole("link", { name: "Algoritmos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("ano inválido fica junto ao campo e não chama a API", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<ClassesList canCreate />);
    const user = userEvent.setup();
    await screen.findByText("Nenhuma turma encontrada.");

    await user.type(screen.getByLabelText("Ano letivo"), "20x6");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expectFieldErrorLinked(screen.getByLabelText("Ano letivo"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("erro de carregamento com Tentar novamente", async () => {
    fetchMock
      .mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro interno."))
      .mockResolvedValueOnce(json(200, { items: [schoolClass("Redes")], nextCursor: null }));
    const { container } = renderWithProviders(<ClassesList canCreate />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toBe("");
    await expectNoA11yViolations(container);
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("link", { name: "Redes" })).toBeTruthy();
  });

  it("carregando: indicador com aria-busy", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    renderWithProviders(<ClassesList canCreate />);
    expect(screen.getByText("Carregando turmas…").closest('[aria-busy="true"]')).not.toBeNull();
  });
});

describe("003/SC-011 SC-012 — ClassesList só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação e pesquisa com Enter", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [schoolClass("Compiladores")], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<ClassesList canCreate />);
    const user = userEvent.setup();
    const link = await screen.findByRole("link", { name: "Compiladores" });

    const search = screen.getByLabelText("Pesquisar por nome ou código");
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Nova turma" }),
      search,
      screen.getByLabelText("Ano letivo"),
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByRole("button", { name: "Pesquisar" }),
      link,
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);

    await tabTo(user, search);
    await user.keyboard("redes{Enter}");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/classes?query=redes");
  });
});
