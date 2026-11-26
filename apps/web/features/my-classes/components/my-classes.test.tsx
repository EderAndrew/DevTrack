import type { MyCohort, MyCohortList } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { mySubjectClasses } from "../schemas/my-classes";
import { MyClasses } from "./my-classes";

// 030/US2 (I1): the year and the search live in the address. Each test sets `address.params`; `replace` is recorded.
const address = vi.hoisted(() => ({ params: new URLSearchParams() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => address.params }));
/** Every year (`?ano=todos`): the US1 tests that span years read all of them. */
const allYears = () => {
  address.params = new URLSearchParams("ano=todos");
};

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
    address.params = new URLSearchParams();
    router.replace.mockReset();
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
    allYears();
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
    allYears();
    const archived: MyCohort = { ...ADS_4NA, classes: [{ ...ADS_4NA.classes[0]!, effectiveStatus: "ARCHIVED" }, ADS_4NA.classes[1]!] };
    fetchMock.mockResolvedValueOnce(json(200, body([2027, [archived]], [2026, [ADS_3NA_2026]])));
    renderWithProviders(<MyClasses welcome={false} />);
    const bd = await screen.findByRole("article", { name: "Banco de Dados" });

    expect(within(bd).getByText("Arquivada")).toBeTruthy();
    expect(within(card("Redes")).queryByText("Arquivada")).toBeNull();
    const closed = card("Algoritmos");
    expect(within(closed).getAllByText("Encerrada")).toHaveLength(1);
    expect(within(closed).getByRole("link", { name: "Acessar Algoritmos · ADS 3NA" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${OLD_ID}`);
    // 027/US8-3: the most recent ano letivo first (every year in the address).
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
    allYears();
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

  it("030/SC-005 030/FR-014 sem violações de acessibilidade nos temas escuro e claro, com busca, filtro e o estado vazio do filtro", async () => {
    // The 360 px check needs a real layout: the E2E `030/SC-005` covers it in both themes.
    try {
      for (const theme of ["dark", "light"] as const) {
        document.documentElement.dataset.theme = theme;
        address.params = new URLSearchParams("ano=todos");
        fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA, EMPTY]], [2026, [ADS_3NA_2026]])));
        const { container, unmount } = renderWithProviders(<MyClasses welcome={false} showRanking />);
        await screen.findByRole("article", { name: "Banco de Dados" });
        await expectNoA11yViolations(container);
        unmount();
        address.params = new URLSearchParams("ano=todos&busca=nada-assim");
        fetchMock.mockResolvedValueOnce(json(200, body([2027, [ADS_4NA]])));
        const empty = renderWithProviders(<MyClasses welcome={false} />);
        await screen.findByText("Nenhuma turma encontrada.");
        await expectNoA11yViolations(empty.container);
        empty.unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });

  it("030/SC-006 a lista que o card \"Matéria\", o Histórico e o ranking leem continua a mesma: enrolledAt não entra", () => {
    // The same `GET /me/classes` body that the 030 screen reads gives the 026/028 consumers exactly what it gave before.
    expect(mySubjectClasses(TWO_YEARS)).toEqual([
      { id: BD_ID, name: "ADS 4NA", code: "ADS-4NA", academicYear: 2027, period: "Noite", teacherName: "Prof. Eder", subjectName: "Banco de Dados", status: "ACTIVE" },
      { id: REDES_ID, name: "ADS 4NA", code: "ADS-4NA", academicYear: 2027, period: "Noite", teacherName: "Prof. Ana", subjectName: "Redes", status: "ACTIVE" },
      { id: OLD_ID, name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: null, teacherName: "Prof. Caio", subjectName: "Algoritmos", status: "INACTIVE" },
    ]);
  });

  describe("030/US2 busca e ano letivo", () => {
    const POO_ID = "88888888-8888-4888-8888-888888888888";
    const OLD_2025_ID = "99999999-9999-4999-8999-999999999999";
    const SI_2026: MyCohort = {
      ...ADS_4NA,
      id: "dddddddd-4444-4444-8444-444444444444",
      name: "SI 2NA",
      code: "SI-2NA",
      classes: [
        { classId: POO_ID, subjectName: "Object Oriented Programming", teacherName: "Prof. Lia", effectiveStatus: "ACTIVE" },
        { classId: BD_ID, subjectName: "Banco de Dados", teacherName: "Prof. Eder", effectiveStatus: "ACTIVE" },
      ],
    };
    const ADS_2025: MyCohort = {
      ...ADS_3NA_2026,
      id: "eeeeeeee-5555-4555-8555-555555555555",
      name: "ADS 1NB",
      code: "ADS-1NB",
      classes: [{ classId: OLD_2025_ID, subjectName: "Lógica de Programação", teacherName: "Prof. Caio", effectiveStatus: "INACTIVE" }],
    };
    const LIST = body([2026, [SI_2026]], [2025, [ADS_2025]]);
    const headings = () => screen.queryAllByRole("article").map((article) => within(article).getByRole("heading", { level: 2 }).textContent);
    const yearCard = () => screen.getByText("Ano letivo").nextElementSibling?.textContent;

    it("030/US2-1 abre no ano letivo mais recente: card \"Ano letivo\" com ele e só as disciplinas dele", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      const { container } = renderWithProviders(<MyClasses welcome={false} />);
      await screen.findByRole("article", { name: "Object Oriented Programming" });
      expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados"]);
      expect(yearCard()).toBe("2026");
      expect((screen.getByRole("combobox", { name: "Ano" }) as HTMLSelectElement).value).toBe("2026");
      expect(router.replace).not.toHaveBeenCalled();
      await expectNoA11yViolations(container);
    });

    it("030/US2-2 o filtro \"Ano\" oferece os anos do mais recente ao mais antigo e \"Todos os anos\"", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      renderWithProviders(<MyClasses welcome={false} />);
      const select = (await screen.findByRole("combobox", { name: "Ano" })) as HTMLSelectElement;
      expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Ano: 2026", "Ano: 2025", "Todos os anos"]);

      const user = userEvent.setup();
      await user.selectOptions(select, "todos");
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?ano=todos");
      expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados", "Lógica de Programação"]);
      expect(yearCard()).toBe("2026");

      await user.selectOptions(select, "2025");
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?ano=2025");
      expect(headings()).toEqual(["Lógica de Programação"]);
      expect(yearCard()).toBe("2025");
    });

    it("030/US2-3 a busca por parte do nome da disciplina, sem acentos nem maiúsculas, combinada com o ano", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      renderWithProviders(<MyClasses welcome={false} />);
      const search = await screen.findByRole("searchbox", { name: "Buscar turma ou disciplina" });
      expect(search.getAttribute("maxLength")).toBe("100");

      const user = userEvent.setup();
      await user.type(search, "ORIÉNT{Enter}");
      expect(headings()).toEqual(["Object Oriented Programming"]);
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?busca=ORI%C3%89NT");

      await user.selectOptions(screen.getByRole("combobox", { name: "Ano" }), "2025");
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?ano=2025&busca=ORI%C3%89NT");
      expect(headings()).toEqual([]);
    });

    it("030/US2-3 a busca vai para o endereço 300 ms depois de parar de digitar, uma vez só", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        fetchMock.mockResolvedValueOnce(json(200, LIST));
        renderWithProviders(<MyClasses welcome={false} />);
        const search = await screen.findByRole("searchbox", { name: "Buscar turma ou disciplina" });
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        await user.type(search, "si-2");
        expect(router.replace).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        expect(router.replace).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?busca=si-2");
        expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("030/US2-4 sem resultado: \"Nenhuma turma encontrada.\" e \"Limpar busca e filtro\" volta ao ano mais recente", async () => {
      address.params = new URLSearchParams("ano=2025&busca=redes");
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      const { container } = renderWithProviders(<MyClasses welcome={false} />);
      expect(await screen.findByText("Nenhuma turma encontrada.")).toBeTruthy();
      expect(screen.queryByRole("article")).toBeNull();
      await expectNoA11yViolations(container);

      await userEvent.setup().click(screen.getByRole("button", { name: "Limpar busca e filtro" }));
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas");
      expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados"]);
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
      expect((screen.getByRole("combobox", { name: "Ano" }) as HTMLSelectElement).value).toBe("2026");
    });

    it("030/US2-5 aba \"Todas as turmas\" com a contagem do ano (sem a busca) e o rodapé", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      renderWithProviders(<MyClasses welcome={false} />);
      expect(await screen.findByRole("tab", { name: "Todas as turmas, 2" })).toBeTruthy();
      expect(screen.getByText("Mostrando 2 de 2 turmas")).toBeTruthy();
      expect(screen.getByText("Entrada mais recente primeiro")).toBeTruthy();

      const user = userEvent.setup();
      await user.type(screen.getByRole("searchbox"), "banco{Enter}");
      expect(screen.getByRole("tab", { name: "Todas as turmas, 2" })).toBeTruthy();
      expect(screen.getByText("Mostrando 1 de 2 turmas").getAttribute("aria-live")).toBe("polite");

      await user.selectOptions(screen.getByRole("combobox", { name: "Ano" }), "2025");
      expect(screen.getByRole("tab", { name: "Todas as turmas, 1" })).toBeTruthy();
      expect(screen.getByText("Mostrando 0 de 1 turma")).toBeTruthy();
    });

    it("030/US2-6 o ano e a busca do endereço valem ao abrir; o bem-vindo fica no endereço", async () => {
      address.params = new URLSearchParams("bem-vindo=1&ano=2025&busca=logica");
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      renderWithProviders(<MyClasses welcome />);
      await screen.findByRole("article", { name: "Lógica de Programação" });
      expect(headings()).toEqual(["Lógica de Programação"]);
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("logica");
      expect(yearCard()).toBe("2025");

      await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Ano" }), "todos");
      expect(router.replace).toHaveBeenLastCalledWith("/minhas-turmas?bem-vindo=1&ano=todos&busca=logica");
    });

    it("030/US2-6 um ano do endereço sem matrícula ativa ou mal formado cai no mais recente, sem reescrever o endereço", async () => {
      for (const ano of ["2019", "abc"]) {
        address.params = new URLSearchParams(`ano=${ano}`);
        fetchMock.mockResolvedValueOnce(json(200, LIST));
        const { unmount } = renderWithProviders(<MyClasses welcome={false} />);
        await screen.findByRole("article", { name: "Object Oriented Programming" });
        expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados"]);
        expect(yearCard()).toBe("2026");
        unmount();
      }
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("030/US2-6 uma mudança do endereço (voltar no navegador) troca o ano e a busca", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      const { rerender } = renderWithProviders(<MyClasses welcome={false} />);
      await screen.findByRole("article", { name: "Object Oriented Programming" });
      address.params = new URLSearchParams("ano=2025&busca=prog");
      rerender(<MyClasses welcome={false} />);
      expect(headings()).toEqual(["Lógica de Programação"]);
      expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("prog");
    });

    it("030/SC-003 a busca e a troca de ano não pedem a lista de novo", async () => {
      fetchMock.mockResolvedValueOnce(json(200, LIST));
      renderWithProviders(<MyClasses welcome={false} />);
      const search = await screen.findByRole("searchbox");
      const user = userEvent.setup();
      await user.type(search, "banco{Enter}");
      await user.selectOptions(screen.getByRole("combobox", { name: "Ano" }), "todos");
      await user.clear(search);
      await user.type(search, "{Enter}");
      expect(headings()).toEqual(["Object Oriented Programming", "Banco de Dados", "Lógica de Programação"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
