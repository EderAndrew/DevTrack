import type { StudentCalendar } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { StudentCalendarCard } from "./student-calendar-card";

// 031/US3 "Seu calendário de aulas" (contracts/ui.md "Student").
const CLASS_ID = "00000000-0000-4000-9000-000000000031";

const calendar = (
  overrides: Partial<StudentCalendar> = {},
): StudentCalendar => ({
  class: {
    id: CLASS_ID,
    subjectName: "Programação Orientada a Objetos",
    teacherName: "Ricardo Mendes",
    startsOn: "2026-08-03",
    endsOn: "2026-12-11",
  },
  today: "2026-11-16",
  days: [
    { date: "2026-11-16", kind: "CLASS", text: null },
    {
      date: "2026-11-18",
      kind: "TEACHER_ABSENCE",
      text: "Atividade no portal.",
    },
    { date: "2026-11-19", kind: "TEACHER_ABSENCE", text: null },
    { date: "2026-11-20", kind: "HOLIDAY", text: "Consciência Negra" },
    { date: "2026-11-23", kind: "EXAM", text: "P1 — Herança" },
  ],
  ...overrides,
});

describe("031/US3 StudentCalendarCard — o calendário da matéria no Painel", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderCard(body: StudentCalendar | Response = calendar()) {
    fetchMock.mockImplementation(async () =>
      body instanceof Response ? body.clone() : json(200, body),
    );
    return renderWithProviders(<StudentCalendarCard classId={CLASS_ID} />);
  }

  const card = () =>
    screen.getByRole("region", { name: "Seu calendário de aulas" });
  const dayButtons = () =>
    within(card())
      .getAllByRole("button", { pressed: undefined })
      .filter((b) => b.hasAttribute("aria-pressed"));
  const detail = () => card().querySelector<HTMLElement>("[aria-live=polite]")!;

  it("031/US3-1 título, intervalo, mês e ano, matéria, setas e os sete dias de SEG a DOM", async () => {
    renderCard();
    expect(await screen.findByText("16–22 nov")).toBeTruthy();
    expect(
      within(card()).getByRole("heading", {
        level: 2,
        name: "Seu calendário de aulas",
      }),
    ).toBeTruthy();
    expect(within(card()).getByText("Novembro 2026")).toBeTruthy();
    expect(
      within(card()).getByText("Programação Orientada a Objetos"),
    ).toBeTruthy();
    expect(
      within(card()).getByRole("button", { name: "Semana anterior" }),
    ).toBeTruthy();
    expect(
      within(card()).getByRole("button", { name: "Próxima semana" }),
    ).toBeTruthy();
    expect(dayButtons().map((button) => button.textContent)).toEqual([
      "SEG16",
      "TER17",
      "QUA18",
      "QUI19",
      "SEX20",
      "SÁB21",
      "DOM22",
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/me/classes/${CLASS_ID}/calendar`,
    ]);
  });

  it("031/US3-2 abre na semana de hoje (data do servidor) com hoje escolhido", async () => {
    renderCard();
    const today = await screen.findByRole("button", {
      name: "Segunda-feira, 16 de novembro, hoje: Aula",
    });
    expect(today.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(detail()).getByText("Segunda-feira, 16 de novembro"),
    ).toBeTruthy();
  });

  it("031/US3-2 fora do período: antes → primeira semana com o primeiro dia marcado; depois → última semana, nenhum dia se não houver marcação", async () => {
    const before = renderCard(
      calendar({
        today: "2026-07-01",
        days: [{ date: "2026-08-05", kind: "CLASS", text: null }],
      }),
    );
    expect(await screen.findByText("3–9 ago")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Quarta-feira, 5 de agosto: Aula" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    before.unmount();

    renderCard(
      calendar({
        today: "2027-01-10",
        days: [{ date: "2026-08-05", kind: "CLASS", text: null }],
      }),
    );
    expect(await screen.findByText("7–13 dez")).toBeTruthy();
    expect(
      dayButtons().every(
        (button) => button.getAttribute("aria-pressed") === "false",
      ),
    ).toBe(true);
    expect(
      within(detail()).getByText("Escolha um dia para ver o que há nele."),
    ).toBeTruthy();
  });

  it("031/US3-3 ponto e nome acessível com a data e o tipo; dia sem marcação sem ponto", async () => {
    renderCard();
    await screen.findByText("16–22 nov");
    const holiday = screen.getByRole("button", {
      name: "Sexta-feira, 20 de novembro: Feriado",
    });
    expect(holiday.querySelector('[data-kind="HOLIDAY"]')?.className).toContain(
      "bg-muted-foreground",
    );
    const absence = screen.getByRole("button", {
      name: "Quarta-feira, 18 de novembro: Falta do professor",
    });
    expect(
      absence.querySelector('[data-kind="TEACHER_ABSENCE"]')?.className,
    ).toContain("border-danger-text");
    const empty = screen.getByRole("button", {
      name: "Terça-feira, 17 de novembro: sem marcação",
    });
    expect(empty.querySelector("[data-kind]")).toBeNull();
  });

  it("031/US3-4 031/US3-5 031/US3-6 031/US3-7 o detalhe de cada tipo com matéria e professor, nunca um tópico", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("16–22 nov");
    const subjectLine =
      "Programação Orientada a Objetos · Prof. Ricardo Mendes";

    // Aula: only "Aula".
    expect(detail().textContent).toBe(
      `Segunda-feira, 16 de novembroAula${subjectLine}`,
    );

    await user.click(
      screen.getByRole("button", { name: /^Sexta-feira, 20 de novembro/ }),
    );
    expect(detail().textContent).toBe(
      `Sexta-feira, 20 de novembroFeriadoConsciência Negra${subjectLine}`,
    );

    await user.click(
      screen.getByRole("button", { name: /^Quarta-feira, 18 de novembro/ }),
    );
    expect(detail().textContent).toBe(
      `Quarta-feira, 18 de novembroFalta do professorAtividade no portal.${subjectLine}`,
    );

    await user.click(
      screen.getByRole("button", { name: /^Quinta-feira, 19 de novembro/ }),
    );
    expect(detail().textContent).toBe(
      `Quinta-feira, 19 de novembroFalta do professor${subjectLine}`,
    );

    await user.click(
      screen.getByRole("button", { name: /^Terça-feira, 17 de novembro/ }),
    );
    expect(detail().textContent).toBe(
      "Terça-feira, 17 de novembroNada marcado neste dia.",
    );
    expect(
      screen
        .getByRole("button", { name: /^Terça-feira, 17 de novembro/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("031/US3-8 031/SC-006 o dia com 1 interação e qualquer semana só com as setas; o mês acompanha; setas param nos extremos", async () => {
    const user = userEvent.setup();
    renderCard();
    await screen.findByText("16–22 nov");

    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(within(card()).getByText("23–29 nov")).toBeTruthy();
    expect(
      dayButtons().every(
        (button) => button.getAttribute("aria-pressed") === "false",
      ),
    ).toBe(true);
    expect(
      within(detail()).getByText("Escolha um dia para ver o que há nele."),
    ).toBeTruthy();
    // One interaction shows a day.
    await user.click(
      screen.getByRole("button", {
        name: "Segunda-feira, 23 de novembro: Prova",
      }),
    );
    expect(detail().textContent).toContain("ProvaP1 — Herança");

    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(within(card()).getByText("30 nov–6 dez")).toBeTruthy();
    expect(within(card()).getByText("Novembro 2026")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(within(card()).getByText("Dezembro 2026")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Próxima semana",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    // Back to the period's first week, only with the arrow.
    const previous = screen.getByRole("button", {
      name: "Semana anterior",
    }) as HTMLButtonElement;
    while (!previous.disabled) await user.click(previous);
    expect(within(card()).getByText("3–9 ago")).toBeTruthy();
    expect(within(card()).getByText("Agosto 2026")).toBeTruthy();
  });

  it("031/US3-10 disciplina sem marcações ou sem período: só o aviso, sem a semana", async () => {
    const empty = renderCard(calendar({ days: [] }));
    expect(
      await screen.findByText(
        "O professor ainda não publicou o calendário desta matéria.",
      ),
    ).toBeTruthy();
    expect(within(card()).queryByRole("button")).toBeNull();
    empty.unmount();

    renderCard(
      calendar({
        class: { ...calendar().class, startsOn: null, endsOn: null },
        days: [],
      }),
    );
    expect(
      await screen.findByText(
        "O professor ainda não publicou o calendário desta matéria.",
      ),
    ).toBeTruthy();
  });

  it('carregando e erro com "Tentar novamente"; um 404 não mostra o card', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(async () =>
      apiError(500, "INTERNAL_ERROR", "x"),
    );
    fetchMock.mockImplementation(async () => json(200, calendar()));
    renderWithProviders(<StudentCalendarCard classId={CLASS_ID} />);
    expect(
      card().getAttribute("aria-busy") ??
        card().querySelector("[aria-busy=true]"),
    ).toBeTruthy();
    expect(
      await screen.findByText("Não foi possível carregar o calendário."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("16–22 nov")).toBeTruthy();
  });

  it("um 404 (matéria que o aluno não vê mais) não mostra o card: a volta da 026 cuida da matéria", async () => {
    renderCard(apiError(404, "NOT_FOUND", "Não encontrado."));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Seu calendário de aulas" }),
      ).toBeNull(),
    );
  });

  it("031/FR-023 textos com marcação aparecem como texto", async () => {
    const user = userEvent.setup();
    const { container } = renderCard(
      calendar({
        class: {
          ...calendar().class,
          subjectName: "<b>POO</b>",
          teacherName: "<img src=x onerror=alert(1)>",
        },
        days: [
          {
            date: "2026-11-16",
            kind: "SPECIAL_EVENT",
            text: "<script>alert(1)</script>",
          },
        ],
      }),
    );
    await screen.findByText("16–22 nov");
    await user.click(
      screen.getByRole("button", { name: /^Segunda-feira, 16 de novembro/ }),
    );
    expect(detail().textContent).toContain("<script>alert(1)</script>");
    expect(detail().textContent).toContain(
      "<b>POO</b> · Prof. <img src=x onerror=alert(1)>",
    );
    expect(container.querySelector("script, b, img")).toBeNull();
  });

  it("031/FR-024 sem violações de acessibilidade nos temas escuro e claro", async () => {
    try {
      for (const theme of ["dark", "light"] as const) {
        document.documentElement.dataset.theme = theme;
        const { container, unmount } = renderCard();
        await screen.findByText("16–22 nov");
        await expectNoA11yViolations(container);
        unmount();
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
