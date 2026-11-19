import type { CohortView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { CohortList } from "./cohort-list";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let sequence = 0;
const cohort = (name: string, overrides: Partial<CohortView> = {}): CohortView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    name,
    code: `T-${sequence}`,
    academicYear: 2026,
    period: null,
    description: null,
    status: "ACTIVE",
    activeEnrollmentCount: 0,
    classCount: 0,
    createdAt: "2026-11-18T12:00:00.000Z",
    updatedAt: "2026-11-18T12:00:00.000Z",
    ...overrides,
  };
};

describe("027/US1-3 CohortList — turmas do gestor com pesquisa, filtros e paginação (FR-006)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista nome, código, ano, período, situação, alunos e disciplinas, com link para a página da turma e Nova turma", async () => {
    const ads = cohort("ADS 3NA", { code: "ADS-3NA", period: "2026.2", activeEnrollmentCount: 30, classCount: 2 });
    const redes = cohort("Redes", { status: "INACTIVE" });
    fetchMock.mockResolvedValueOnce(json(200, { items: [ads, redes], nextCursor: null }));
    const { container } = renderWithProviders(<CohortList canCreate />);

    const link = await screen.findByRole("link", { name: "ADS 3NA" });
    expect(link.getAttribute("href")).toBe(`/gestao/turmas/${ads.id}`);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/cohorts");
    const row = link.closest("tr")!;
    for (const text of ["ADS-3NA", "2026", "2026.2", "Ativa", "30", "2"]) expect(within(row).getByText(text)).toBeTruthy();
    expect(within(screen.getByRole("link", { name: "Redes" }).closest("tr")!).getByText("Inativa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nova turma" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("sem permissão de criar não mostra Nova turma; lista vazia diz que não há turmas", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<CohortList canCreate={false} />);
    expect(await screen.findByText("Nenhuma turma encontrada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nova turma" })).toBeNull();
  });

  it("pesquisa com ano e situação no servidor e carrega mais com o cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [], nextCursor: null }))
      .mockResolvedValueOnce(json(200, { items: [cohort("Algoritmos")], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [cohort("Algoritmos II")], nextCursor: null }));
    renderWithProviders(<CohortList canCreate />);
    const user = userEvent.setup();
    await screen.findByText("Nenhuma turma encontrada.");

    await user.type(screen.getByLabelText("Pesquisar por nome ou código"), "algo");
    await user.type(screen.getByLabelText("Ano letivo"), "2026");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await screen.findByRole("link", { name: "Algoritmos" });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/cohorts?q=algo&academicYear=2026");

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    await screen.findByRole("link", { name: "Algoritmos II" });
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/cohorts?q=algo&academicYear=2026&cursor=c1");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("ano inválido não pesquisa e aponta o campo", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<CohortList canCreate />);
    const user = userEvent.setup();
    await screen.findByText("Nenhuma turma encontrada.");
    await user.type(screen.getByLabelText("Ano letivo"), "20x6");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expect(await screen.findByText("Corrija a pesquisa")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("027/FR-033 nome de turma com HTML aparece como texto", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [cohort("<b>Turma</b>")], nextCursor: null }));
    const { container } = renderWithProviders(<CohortList canCreate={false} />);
    expect(await screen.findByRole("link", { name: "<b>Turma</b>" })).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });
});
