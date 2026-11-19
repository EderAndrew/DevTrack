import type { MyCohort, MyCohortList } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { MyClasses } from "./my-classes";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const BD_ID = "55555555-5555-4555-8555-555555555555";
const REDES_ID = "66666666-6666-4666-8666-666666666666";
const OLD_ID = "77777777-7777-4777-8777-777777777777";

const ADS_4NA: MyCohort = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  name: "ADS 4NA",
  code: "ADS-4NA",
  period: "Noite",
  status: "ACTIVE",
  classes: [
    { classId: BD_ID, subjectName: "Banco de Dados", teacherName: "Prof. Eder", effectiveStatus: "ACTIVE" },
    { classId: REDES_ID, subjectName: "Redes", teacherName: "Prof. Ana", effectiveStatus: "ACTIVE" },
  ],
};
const ADS_3NA_2026: MyCohort = {
  id: "bbbbbbbb-2222-4222-8222-222222222222",
  name: "ADS 3NA",
  code: "ADS-3NA",
  period: null,
  status: "INACTIVE",
  classes: [{ classId: OLD_ID, subjectName: "Algoritmos", teacherName: "Prof. Caio", effectiveStatus: "INACTIVE" }],
};
const EMPTY: MyCohort = { id: "cccccccc-3333-4333-8333-333333333333", name: "ADS 1NA", code: "ADS-1NA", period: null, status: "ACTIVE", classes: [] };

const body = (...years: [number, MyCohort[]][]): MyCohortList => ({
  years: years.map(([academicYear, cohorts]) => ({ academicYear, cohorts })),
});
const TWO_YEARS = body([2027, [ADS_4NA]], [2026, [ADS_3NA_2026]]);

const cohortSection = (name: string) => screen.getByRole("heading", { level: 3, name }).closest("section")!;

describe("MyClasses — Minhas turmas", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe("003/US7-1 003/SC-011 as turmas do aluno (FR-038)", () => {
    it("estado vazio", async () => {
      fetchMock.mockResolvedValueOnce(json(200, { years: [] }));
      renderWithProviders(<MyClasses welcome={false} />);
      expect(await screen.findByText("Você ainda não participa de nenhuma turma.")).toBeTruthy();
      expect(fetchMock.mock.calls[0]![0]).toBe("/api/me/classes");
      expect(screen.queryByRole("table")).toBeNull();
    });

    it("vindo do aceite: anuncia \"Você agora faz parte da turma.\"", async () => {
      fetchMock.mockResolvedValueOnce(json(200, TWO_YEARS));
      const { container } = renderWithProviders(<MyClasses welcome />);
      const notice = screen.getByRole("status");
      expect(within(notice).getByRole("heading", { name: "Você agora faz parte da turma." })).toBeTruthy();
      await screen.findByText("ADS 4NA");
      await expectNoA11yViolations(container);
    });

    it("falha ao carregar: mensagem e Tentar novamente", async () => {
      fetchMock.mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro.")).mockResolvedValueOnce(json(200, TWO_YEARS));
      renderWithProviders(<MyClasses welcome={false} />);
      const alert = await screen.findByRole("alert");
      await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
      expect(await screen.findByText("ADS 4NA")).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("027/US8-1 026/US4-1 a turma uma vez, com o código, o período e cada disciplina com o seu professor e o link ?materia=", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} />);

    await screen.findByRole("heading", { level: 3, name: "ADS 4NA" });
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    const section = cohortSection("ADS 4NA");
    expect(within(section).getByText("Código: ADS-4NA")).toBeTruthy();
    expect(within(section).getByText(/Período: Noite/)).toBeTruthy();
    const rows = within(section).getAllByRole("row").slice(1).map((row) => Array.from(row.children).slice(0, 2).map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Banco de Dados", "Prof. Eder"],
      ["Redes", "Prof. Ana"],
    ]);
    expect(screen.getByRole("link", { name: "Atividades de Banco de Dados · ADS 4NA" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${BD_ID}`);
    expect(screen.queryByText("Encerrada")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("027/US8-2 026/US4-2 turma sem disciplina: \"Ainda não há disciplinas nesta turma.\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA, EMPTY]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} />);
    await screen.findByRole("heading", { level: 3, name: "ADS 1NA" });
    const section = cohortSection("ADS 1NA");
    expect(within(section).getByText("Ainda não há disciplinas nesta turma.")).toBeTruthy();
    expect(within(section).queryByRole("table")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("027/US8-3 seções por ano letivo, a mais recente primeiro; a turma encerrada com o selo e o link de leitura", async () => {
    fetchMock.mockResolvedValueOnce(json(200, TWO_YEARS));
    const { container } = renderWithProviders(<MyClasses welcome={false} />);
    await screen.findByRole("heading", { level: 2, name: "2027" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["2027", "2026"]);
    const year2026 = screen.getByRole("heading", { level: 2, name: "2026" }).closest("section")!;
    expect(within(year2026).getByRole("heading", { level: 3, name: "ADS 3NA" })).toBeTruthy();
    const closed = cohortSection("ADS 3NA");
    expect(within(closed).getAllByText("Encerrada")).toHaveLength(1);
    expect(within(closed).getByRole("link", { name: "Atividades de Algoritmos · ADS 3NA" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${OLD_ID}`);
    expect(within(cohortSection("ADS 4NA")).queryByText("Encerrada")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("027/US8-4 disciplina arquivada numa turma ativa: o selo \"Arquivada\" só nela", async () => {
    const archived: MyCohort = { ...ADS_4NA, classes: [{ ...ADS_4NA.classes[0]!, effectiveStatus: "ARCHIVED" }, ADS_4NA.classes[1]!] };
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [archived]])));
    renderWithProviders(<MyClasses welcome={false} />);
    await screen.findByRole("heading", { level: 3, name: "ADS 4NA" });
    const [bd, redes] = within(cohortSection("ADS 4NA")).getAllByRole("row").slice(1);
    expect(within(bd!).getByText("Arquivada")).toBeTruthy();
    expect(within(redes!).queryByText("Arquivada")).toBeNull();
  });

  it("013/FR-021 com ranking.turma.visualizar, cada disciplina leva o link \"Ranking\"; sem ela, nenhum", async () => {
    fetchMock.mockImplementation(async () => json(200, TWO_YEARS));
    const { unmount } = renderWithProviders(<MyClasses welcome={false} showRanking />);
    const link = await screen.findByRole("link", { name: "Ranking de Banco de Dados · ADS 4NA" });
    expect(link.getAttribute("href")).toBe(`/minhas-turmas/${BD_ID}/ranking`);
    expect(screen.getByRole("link", { name: "Ranking de Algoritmos · ADS 3NA" })).toBeTruthy();
    unmount();

    renderWithProviders(<MyClasses welcome={false} />);
    await screen.findByText("ADS 4NA");
    expect(screen.queryByRole("link", { name: /Ranking/ })).toBeNull();
  });
});
