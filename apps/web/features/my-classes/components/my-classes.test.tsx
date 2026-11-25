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
const ENROLLED = "2026-11-07T21:08:00.000Z";

const ADS_4NA: MyCohort = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  name: "ADS 4NA",
  code: "ADS-4NA",
  period: "Noite",
  status: "ACTIVE",
  enrolledAt: ENROLLED,
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
  enrolledAt: "2026-02-01T12:00:00.000Z",
  classes: [{ classId: OLD_ID, subjectName: "Algoritmos", teacherName: "Prof. Caio", effectiveStatus: "INACTIVE" }],
};
const EMPTY: MyCohort = { id: "cccccccc-3333-4333-8333-333333333333", name: "ADS 1NA", code: "ADS-1NA", period: null, status: "ACTIVE", enrolledAt: ENROLLED, classes: [] };

const body = (...years: [number, MyCohort[]][]): MyCohortList => ({
  years: years.map(([academicYear, cohorts]) => ({ academicYear, cohorts })),
});
const TWO_YEARS = body([2027, [ADS_4NA]], [2026, [ADS_3NA_2026]]);

/** The card (an `article`) named by its disciplina heading. */
const card = (name: string) => screen.getByRole("article", { name });

describe("MyClasses — Minhas turmas (030)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("030/US1-1 título, subtítulo e um card por disciplina da turma", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA]])));
    renderWithProviders(<MyClasses welcome={false} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Minhas turmas" })).toBeTruthy();
    expect(screen.getByText("Suas disciplinas, professores e rankings em um só lugar.")).toBeTruthy();
    await screen.findByRole("article", { name: "Banco de Dados" });
    expect(screen.getAllByRole("article").map((article) => article.getAttribute("aria-labelledby") && within(article).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Banco de Dados",
      "Redes",
    ]);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/me/classes");
  });

  it("030/US1-2 027/US8-1 026/US4-1 o card: código, turma, disciplina, professor, ano, período, entrada na turma e código", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA, ADS_3NA_2026]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} />);
    const bd = await screen.findByRole("article", { name: "Banco de Dados" });

    expect(within(bd).getByText("ADS-4NA", { selector: "[data-slot=badge]" })).toBeTruthy();
    expect(within(bd).getByText("ADS 4NA")).toBeTruthy();
    expect(within(bd).getByText("Disciplina")).toBeTruthy();
    const facts = Object.fromEntries(
      within(bd).getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(facts).toEqual({ Professor: "Prof. Eder", Ano: "2027", Período: "Noite", "Entrada na turma": "07/11/2026, 18:08" });
    expect(within(bd).getByText("Código da turma: ADS-4NA")).toBeTruthy();
    expect(within(card("Redes")).getByText("Prof. Ana")).toBeTruthy();

    const algoritmos = card("Algoritmos");
    const period = within(algoritmos).getByText("Período").nextElementSibling;
    expect(period?.textContent).toBe("—");
    await expectNoA11yViolations(container);
  });

  it("030/US1-3 \"Acessar turma\" abre Minhas atividades da disciplina, com nome acessível que distingue os cards", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA]])));
    renderWithProviders(<MyClasses welcome={false} />);
    const link = await screen.findByRole("link", { name: "Acessar Banco de Dados · ADS 4NA" });
    expect(link.getAttribute("href")).toBe(`/minhas-atividades?materia=${BD_ID}`);
    expect(link.textContent).toContain("Acessar turma");
    expect(screen.getByRole("link", { name: "Acessar Redes · ADS 4NA" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${REDES_ID}`);
  });

  it("030/US1-4 013/FR-021 com ranking.turma.visualizar, cada card tem o painel \"Ranking da turma\" e \"Ver ranking\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, TWO_YEARS));
    const { container } = renderWithProviders(<MyClasses welcome={false} showRanking />);
    const bd = await screen.findByRole("article", { name: "Banco de Dados" });
    expect(within(bd).getByRole("heading", { level: 3, name: "Ranking da turma" })).toBeTruthy();
    expect(within(bd).getByText("Confira a classificação e acompanhe sua posição nesta turma.")).toBeTruthy();
    const ranking = within(bd).getByRole("link", { name: "Ver ranking de Banco de Dados · ADS 4NA" });
    expect(ranking.getAttribute("href")).toBe(`/minhas-turmas/${BD_ID}/ranking`);
    expect(screen.getByRole("link", { name: "Ver ranking de Algoritmos · ADS 3NA" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("030/US1-5 sem a permissão do ranking, nenhum painel nem link de ranking", async () => {
    fetchMock.mockResolvedValueOnce(json(200, TWO_YEARS));
    renderWithProviders(<MyClasses welcome={false} />);
    await screen.findByRole("article", { name: "Banco de Dados" });
    expect(screen.queryByText("Ranking da turma")).toBeNull();
    expect(screen.queryByRole("link", { name: /ranking/i })).toBeNull();
  });

  it("030/US1-6 027/US8-3 027/US8-4 turma encerrada e disciplina arquivada dizem a situação em texto e seguem com \"Acessar turma\"", async () => {
    const archived: MyCohort = { ...ADS_4NA, classes: [{ ...ADS_4NA.classes[0]!, effectiveStatus: "ARCHIVED" }, ADS_4NA.classes[1]!] };
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [archived]], [2026, [ADS_3NA_2026]])));
    renderWithProviders(<MyClasses welcome={false} />);
    const bd = await screen.findByRole("article", { name: "Banco de Dados" });

    expect(within(bd).getByText("Arquivada")).toBeTruthy();
    expect(within(card("Redes")).queryByText("Arquivada")).toBeNull();
    const closed = card("Algoritmos");
    expect(within(closed).getAllByText("Encerrada")).toHaveLength(1);
    expect(within(closed).getByRole("link", { name: "Acessar Algoritmos · ADS 3NA" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${OLD_ID}`);
    // 027/US8-3: the most recent ano letivo first.
    expect(screen.getAllByRole("article").map((article) => within(article).getByRole("heading", { level: 2 }).textContent)).toEqual([
      "Banco de Dados",
      "Redes",
      "Algoritmos",
    ]);
  });

  it("030/US1-7 027/US8-2 026/US4-2 turma sem disciplinas: um card com \"Ainda não há disciplinas nesta turma.\", sem acesso nem ranking", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA, EMPTY]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} showRanking />);
    const empty = await screen.findByRole("article", { name: "ADS 1NA" });
    expect(within(empty).getByText("Ainda não há disciplinas nesta turma.")).toBeTruthy();
    expect(within(empty).getByText("ADS-1NA", { selector: "[data-slot=badge]" })).toBeTruthy();
    expect(within(empty).getByText("Entrada na turma")).toBeTruthy();
    expect(within(empty).queryByRole("link")).toBeNull();
    expect(within(empty).queryByText("Ranking da turma")).toBeNull();
    expect(within(empty).queryByText("Professor")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("030/US1-8 disciplina migrada sem nome: o destaque é o nome da turma, sem \"Disciplina\"", async () => {
    const unnamed: MyCohort = { ...ADS_4NA, classes: [{ ...ADS_4NA.classes[0]!, subjectName: null }] };
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [unnamed]])));
    renderWithProviders(<MyClasses welcome={false} />);
    const article = await screen.findByRole("article", { name: "ADS 4NA" });
    expect(within(article).queryByText("Disciplina")).toBeNull();
    expect(within(article).getByRole("link", { name: "Acessar ADS 4NA" })).toBeTruthy();
  });

  it("030/US1-9 003/US7-1 003/SC-011 sem turmas: só o estado vazio, sem busca, filtro, aba nem card \"Ano letivo\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { years: [] }));
    renderWithProviders(<MyClasses welcome={false} />);
    expect(await screen.findByText("Você ainda não participa de nenhuma turma.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Minhas turmas" })).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText("Ano letivo")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  describe("030/US1-10 boas-vindas e falha ao carregar", () => {
    it("vindo do aceite: anuncia \"Você agora faz parte da turma.\"", async () => {
      fetchMock.mockResolvedValueOnce(json(200, TWO_YEARS));
      const { container } = renderWithProviders(<MyClasses welcome />);
      const notice = screen.getByRole("status");
      expect(within(notice).getByRole("heading", { name: "Você agora faz parte da turma." })).toBeTruthy();
      await screen.findByRole("article", { name: "Banco de Dados" });
      await expectNoA11yViolations(container);
    });

    it("falha ao carregar: mensagem e Tentar novamente", async () => {
      fetchMock.mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro.")).mockResolvedValueOnce(json(200, TWO_YEARS));
      renderWithProviders(<MyClasses welcome={false} />);
      const alert = await screen.findByRole("alert");
      await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
      expect(await screen.findByRole("article", { name: "Banco de Dados" })).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("030/FR-013 nomes com marcação aparecem como texto", async () => {
    const html: MyCohort = {
      ...ADS_4NA,
      name: "<b>Turma</b>",
      classes: [{ ...ADS_4NA.classes[0]!, subjectName: "<img src=x onerror=alert(1)>", teacherName: "<i>Prof</i>" }],
    };
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [html]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} showRanking />);
    await screen.findByRole("article", { name: "<img src=x onerror=alert(1)>" });
    expect(screen.getByText("<b>Turma</b>")).toBeTruthy();
    expect(screen.getByText("<i>Prof</i>")).toBeTruthy();
    expect(container.querySelector("img, b, i")).toBeNull();
  });

  it("030/SC-001 030/SC-002 030/SC-005 cada disciplina em exatamente um card, a um clique das atividades e do ranking, sem violações de acessibilidade", async () => {
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA, EMPTY]], [2026, [ADS_3NA_2026]])));
    const { container } = renderWithProviders(<MyClasses welcome={false} showRanking />);
    await screen.findByRole("article", { name: "Banco de Dados" });
    for (const id of [BD_ID, REDES_ID, OLD_ID]) {
      expect(container.querySelectorAll(`a[href="/minhas-atividades?materia=${id}"]`)).toHaveLength(1);
      expect(container.querySelectorAll(`a[href="/minhas-turmas/${id}/ranking"]`)).toHaveLength(1);
    }
    expect(screen.getAllByRole("article")).toHaveLength(4);
    await expectNoA11yViolations(container);
  });
});
