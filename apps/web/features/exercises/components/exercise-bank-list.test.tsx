import type { ExercisePage } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExerciseBankList } from "./exercise-bank-list";
import { exerciseApiMock, exerciseView, JAVA, json, POO, POO_REVISION } from "./test-fixtures";

const topic = {
  syllabusItemId: POO_REVISION.groups[0]!.items[0]!.id,
  itemText: "Herança",
  subjectId: POO.id,
  subjectName: POO.name,
  syllabusRevisionId: POO_REVISION.id,
};
const first = exerciseView({ statement: "Explique a herança", topic });
const second = exerciseView({ type: "MULTIPLE_CHOICE", status: "DRAFT", origin: "AI_GENERATED", statement: "Qual palavra estende?", expectedAnswer: null, batchId: "00000000-0000-4000-d000-000000000001" });
const third = exerciseView({ statement: "Mais um" });

describe("010/US5 ExerciseBankList — consultar o banco", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const lists: URLSearchParams[] = [];
  let pages: (query: URLSearchParams) => ExercisePage;

  beforeEach(() => {
    lists.length = 0;
    pages = () => ({ items: [first, second], nextCursor: null });
    const reads = exerciseApiMock(() => json(500, {}));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/exercises") {
        lists.push(url.searchParams);
        return json(200, pages(url.searchParams));
      }
      return reads(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista os exercícios com tipo, dificuldade, tópico, origem e situação em palavras; sem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<ExerciseBankList />);
    const link = await screen.findByRole("link", { name: "Explique a herança" });
    expect(link.getAttribute("href")).toBe(`/exercicios/${first.id}`);
    const row = screen.getByRole("link", { name: "Qual palavra estende?" }).closest("tr")!;
    expect(within(row).getByText("Múltipla escolha")).toBeTruthy();
    expect(within(row).getByText("Gerado por IA")).toBeTruthy();
    expect(within(row).getByText("Rascunho")).toBeTruthy();
    expect(within(link.closest("tr")!).getByText(POO.name)).toBeTruthy();
    // The default query sends no filter: the API shows DRAFT and APPROVED, never ARCHIVED.
    expect([...lists[0]!.keys()]).toEqual([]);
    await expectNoA11yViolations(container);
  });

  it("010/US5-1 aplica a busca e todos os filtros juntos na consulta do servidor", async () => {
    renderWithProviders(<ExerciseBankList />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Explique a herança" });
    await user.type(screen.getByLabelText("Pesquisar no enunciado"), "  herança ");
    await screen.findByRole("option", { name: POO.name });
    await user.selectOptions(screen.getByLabelText("Disciplina"), POO.id);
    await user.selectOptions(await screen.findByLabelText("Ementa"), await screen.findByRole("option", { name: "Versão 1" }));
    await user.selectOptions(screen.getByLabelText("Tópico"), await screen.findByRole("option", { name: "Herança" }));
    await user.selectOptions(screen.getByLabelText("Dificuldade"), "Avançado");
    await user.selectOptions(screen.getByLabelText("Objetivo cognitivo"), "Aplicar");
    await user.selectOptions(screen.getByLabelText("Tipo"), "Exercício de código");
    await user.selectOptions(screen.getByLabelText("Origem"), "Manual");
    await user.selectOptions(screen.getByLabelText("Situação"), "Arquivado");
    await user.selectOptions(screen.getByLabelText("Linguagem"), await screen.findByRole("option", { name: JAVA.name }));
    pages = () => ({ items: [], nextCursor: null });
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expect(await screen.findByText("Nenhum exercício atende a esses filtros.")).toBeTruthy();
    expect(Object.fromEntries(lists.at(-1)!)).toEqual({
      query: "herança",
      subjectId: POO.id,
      syllabusRevisionId: POO_REVISION.id,
      syllabusItemId: topic.syllabusItemId,
      difficulty: "ADVANCED",
      cognitiveObjective: "APPLY",
      type: "CODE",
      origin: "MANUAL",
      status: "ARCHIVED",
      languageId: JAVA.id,
    });

    // Changing the subject clears the syllabus and the topic chosen under it.
    await user.selectOptions(screen.getByLabelText("Disciplina"), "Todas");
    expect((screen.getByLabelText("Ementa") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Tópico") as HTMLSelectElement).value).toBe("");

    // "Limpar filtros" empties the form and goes back to the unfiltered bank.
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(await screen.findByRole("link", { name: "Explique a herança" })).toBeTruthy();
    expect((screen.getByLabelText("Pesquisar no enunciado") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("");
  });

  it("010/US5-1 \"Carregar mais\" pede a próxima página pelo cursor e acrescenta à lista", async () => {
    pages = (query) => (query.get("cursor") === "pagina-2" ? { items: [third], nextCursor: null } : { items: [first, second], nextCursor: "pagina-2" });
    renderWithProviders(<ExerciseBankList />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("link", { name: "Mais um" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explique a herança" })).toBeTruthy();
    expect(lists.at(-1)!.get("cursor")).toBe("pagina-2");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("banco vazio: estado vazio que explica onde os exercícios aparecem", async () => {
    pages = () => ({ items: [], nextCursor: null });
    renderWithProviders(<ExerciseBankList />);
    expect(await screen.findByText("Seu banco ainda não tem exercícios")).toBeTruthy();
  });

  it("SC-012 a ordem de Tab segue os campos da pesquisa, pulando os que dependem de outra escolha", async () => {
    renderWithProviders(<ExerciseBankList />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Explique a herança" });
    await expectTabOrder(user, [
      screen.getByLabelText("Pesquisar no enunciado"),
      screen.getByLabelText("Disciplina"),
      screen.getByLabelText("Dificuldade"),
      screen.getByLabelText("Objetivo cognitivo"),
      screen.getByLabelText("Tipo"),
      screen.getByLabelText("Origem"),
      screen.getByLabelText("Situação"),
      screen.getByLabelText("Linguagem"),
      screen.getByRole("button", { name: "Pesquisar" }),
      screen.getByRole("button", { name: "Limpar filtros" }),
      screen.getByRole("link", { name: "Explique a herança" }),
    ]);
  });
});
