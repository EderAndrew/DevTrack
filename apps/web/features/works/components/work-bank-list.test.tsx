import type { WorkPage, WorkSummary } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import {
  apiError,
  itemId,
  json,
  POO,
  POO_REVISION,
  workApiMock,
} from "./test-fixtures";
import { WorkBankList } from "./work-bank-list";

const summary = (
  n: number,
  overrides: Partial<WorkSummary> = {},
): WorkSummary => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  subject: { id: POO.id, name: POO.name },
  title: `Trabalho ${n}`,
  difficulty: null,
  totalGrade: "10.00",
  questionCount: 3,
  origin: "MANUAL",
  status: "APPROVED",
  topics: [],
  humanEdited: false,
  createdAt: "2026-09-30T12:00:00.000Z",
  updatedAt: "2026-09-30T12:00:00.000Z",
  ...overrides,
});

describe("011/US7 WorkBankList — consultar o Banco de Trabalhos", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const lists: URLSearchParams[] = [];
  let answer: (params: URLSearchParams) => WorkPage;

  beforeEach(() => {
    lists.length = 0;
    answer = () => ({
      items: [
        summary(1, {
          title: "Herança e polimorfismo",
          difficulty: "INTERMEDIATE",
          origin: "AI_GENERATED",
          status: "DRAFT",
          humanEdited: true,
          totalGrade: "0.50",
          topics: [{ syllabusItemId: itemId("Herança"), itemText: "Herança" }],
        }),
        summary(2, { questionCount: 1 }),
      ],
      nextCursor: null,
    });
    const reads = workApiMock(() => apiError(500, "INTERNAL", "x"));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/works" || url.startsWith("/api/works?")) {
        const params = new URLSearchParams(url.split("?")[1] ?? "");
        lists.push(params);
        return json(200, answer(params));
      }
      return reads(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("011/US7-1 mostra título, disciplina e tópicos, questões e nota, dificuldade, origem e situação em palavras; sem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<WorkBankList />);
    const link = await screen.findByRole("link", {
      name: "Herança e polimorfismo",
    });
    expect(link.getAttribute("href")).toBe(`/trabalhos/${summary(1).id}`);
    const row = link.closest("tr")!;
    for (const text of [
      "Herança",
      "3 questões · nota 0,50",
      "Intermediário",
      "Gerado por IA",
      "Editado por você",
      "Rascunho",
    ]) {
      expect(row.textContent).toContain(text);
    }
    expect(
      within(
        screen.getByRole("link", { name: "Trabalho 2" }).closest("tr")!,
      ).getByText("1 questão · nota 10,00"),
    ).toBeTruthy();
    expect(lists[0]!.toString()).toBe("");
    await expectNoA11yViolations(container);
  });

  it("011/FR-031 os filtros vão à API: busca, disciplina, ementa, tópico, origem, situação, dificuldade e período", async () => {
    renderWithProviders(<WorkBankList />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Trabalho 2" });
    await user.type(
      screen.getByRole("searchbox", { name: "Pesquisar no título" }),
      "  heranca ",
    );
    await screen.findByRole("option", { name: POO.name });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Disciplina" }),
      POO.name,
    );
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Ementa" }),
      "Versão 1",
    );
    await screen.findByRole("option", { name: "Herança" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Tópico" }),
      "Herança",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Origem" }),
      "Gerado por IA",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Situação" }),
      "Arquivado",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Dificuldade" }),
      "Avançado",
    );
    await user.type(screen.getByLabelText("Criado a partir de"), "2026-09-01");
    await user.type(screen.getByLabelText("Criado até"), "2026-09-30");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await vi.waitFor(() => expect(lists).toHaveLength(2));
    expect(Object.fromEntries(lists[1]!)).toEqual({
      query: "heranca",
      subjectId: POO.id,
      syllabusRevisionId: POO_REVISION.id,
      syllabusItemId: itemId("Herança"),
      origin: "AI_GENERATED",
      status: "ARCHIVED",
      difficulty: "ADVANCED",
      createdFrom: "2026-09-01",
      createdTo: "2026-09-30",
    });

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(
      (screen.getByRole("combobox", { name: "Situação" }) as HTMLSelectElement)
        .value,
    ).toBe("");
  });

  it('"Carregar mais" pede a página seguinte pelo cursor e acrescenta à lista', async () => {
    answer = (params) =>
      params.get("cursor") === "c1"
        ? { items: [summary(3)], nextCursor: null }
        : { items: [summary(1), summary(2)], nextCursor: "c1" };
    renderWithProviders(<WorkBankList />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Carregar mais" }),
    );
    expect(
      await screen.findByRole("link", { name: "Trabalho 3" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("banco vazio mostra o estado vazio; filtros sem resultado dizem isso", async () => {
    answer = () => ({ items: [], nextCursor: null });
    renderWithProviders(<WorkBankList />);
    const user = userEvent.setup();
    expect(
      await screen.findByText("Seu banco ainda não tem trabalhos"),
    ).toBeTruthy();
    await user.type(
      screen.getByRole("searchbox", { name: "Pesquisar no título" }),
      "nada",
    );
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expect(
      await screen.findByText("Nenhum trabalho atende a esses filtros."),
    ).toBeTruthy();
  });

  it("011/SC-012 busca, filtros, Pesquisar e o primeiro trabalho pelo teclado, nessa ordem", async () => {
    renderWithProviders(<WorkBankList />);
    const user = userEvent.setup();
    const first = await screen.findByRole("link", {
      name: "Herança e polimorfismo",
    });
    await expectTabOrder(user, [
      screen.getByRole("searchbox", { name: "Pesquisar no título" }),
      screen.getByRole("combobox", { name: "Disciplina" }),
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByLabelText("Criado até"),
      screen.getByRole("button", { name: "Pesquisar" }),
      screen.getByRole("button", { name: "Limpar filtros" }),
      first,
    ]);
  });
});
