import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { apiError, json, routedFetch } from "../../student-activities/components/test-fixtures";
import { ClassRankingView } from "./class-ranking";
import { NO_POINTS_YET, NO_STUDENTS, RankingTable } from "./ranking-table";
import { CLASS, classRanking, row, SEVEN } from "./test-fixtures";

const PATH = `GET /api/me/classes/${CLASS.id}/ranking`;

const bodyRows = () => screen.getAllByRole("row").slice(1);
const cells = (tr: HTMLElement) => within(tr).getAllByRole("cell").map((cell) => cell.textContent);

describe("013/US4 tabela do ranking", () => {
  it("013/US4-4 013/FR-019 todas as posições: Posição, Aluno, Pontos, com empate dividindo a posição", () => {
    renderWithProviders(<RankingTable rows={SEVEN} caption="Ranking da turma POO Noturno" />);
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Posição", "Aluno", "Pontos"]);
    expect(bodyRows().map(cells)).toEqual([
      ["1º", "Ana Lima", "105"],
      ["2º", "Bruno Alves", "60"],
      ["2º", "Carla Dias", "60"],
      ["4º", "Davi RochaVocê", "45"],
      ["5º", "Elisa Melo", "30"],
      ["6º", "Fábio Nunes", "0"],
      ["6º", "Gabi Souza", "0"],
    ]);
    expect(screen.queryByText(NO_POINTS_YET)).toBeNull();
  });

  it("013/FR-021 a linha de quem vê leva o texto \"Você\", não só cor", () => {
    renderWithProviders(<RankingTable rows={SEVEN} caption="Ranking" />);
    const mine = bodyRows().filter((tr) => within(tr).queryByText("Você") !== null);
    expect(mine).toHaveLength(1);
    expect(within(mine[0]!).getByText("Davi Rocha")).toBeTruthy();
  });

  it("013/US4-3 todos com 0 ponto: a lista e o aviso \"Ainda não há pontos nesta turma.\"", () => {
    renderWithProviders(<RankingTable rows={[row(1, "Ana", 0), row(1, "Bia", 0, true)]} caption="Ranking" />);
    expect(screen.getByText(NO_POINTS_YET)).toBeTruthy();
    expect(bodyRows().map(cells)).toEqual([
      ["1º", "Ana", "0"],
      ["1º", "BiaVocê", "0"],
    ]);
  });

  it("013/FR-019 sem aluno ativo: \"Esta turma ainda não tem alunos.\", sem tabela", () => {
    renderWithProviders(<RankingTable rows={[]} caption="Ranking" />);
    expect(screen.getByText(NO_STUDENTS)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(NO_POINTS_YET)).toBeNull();
  });
});

describe("013/US4 tela \"Ranking\" do aluno", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(response: Parameters<typeof routedFetch>[0][string]) {
    vi.stubGlobal("fetch", routedFetch({ [PATH]: response }).fetch);
    return { ...renderWithProviders(<ClassRankingView classId={CLASS.id} />), user: userEvent.setup() };
  }

  it("013/US4-4 título com a turma, todas as posições e a linha do aluno marcada", async () => {
    setup(json(200, classRanking()));
    expect(await screen.findByRole("heading", { level: 1, name: "Ranking — POO Noturno" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Ranking da turma POO Noturno" })).toBeTruthy();
    expect(bodyRows()).toHaveLength(7);
    expect(screen.getByRole("link", { name: "Minhas turmas" }).getAttribute("href")).toBe("/minhas-turmas");
  });

  it("013/US4-6 turma de que o aluno não participa: a mensagem de não encontrado, sem tabela", async () => {
    setup(apiError(404, "NOT_FOUND", "Não encontrado."));
    expect(await screen.findByText("Recurso não encontrado.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("013/US4 erro de carga com \"Tentar novamente\"", async () => {
    let fail = true;
    const { user } = setup(() => (fail ? apiError(500, "INTERNAL_ERROR", "Erro.") : json(200, classRanking())));
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.queryByRole("table")).toBeNull();
    fail = false;
    await user.click(retry);
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("013/US4 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { container, user } = setup(json(200, classRanking()));
    await screen.findByRole("table");
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [screen.getByRole("link", { name: "Minhas turmas" })]);
  });
});
