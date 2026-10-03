import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { RankingCard } from "./ranking-card";
import { NO_POINTS_YET, NO_STUDENTS } from "./ranking-table";
import { CLASS, row, SEVEN } from "./test-fixtures";

const TOP = SEVEN.slice(0, 5);

describe("013/US4 cartão de ranking do painel", () => {
  it("013/US4-1 013/FR-021 \"Ranking — {turma}\", do 1º ao 5º com nome e pontos e \"Ver ranking completo\"", () => {
    renderWithProviders(<RankingCard ranking={{ class: CLASS, top: TOP }} />);
    const card = screen.getByRole("region", { name: "Ranking — POO Noturno" });
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows.map((tr) => within(tr).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["1º", "Ana Lima", "105"],
      ["2º", "Bruno Alves", "60"],
      ["2º", "Carla Dias", "60"],
      ["4º", "Davi RochaVocê", "45"],
      ["5º", "Elisa Melo", "30"],
    ]);
    expect(within(card).getByRole("link", { name: "Ver ranking completo de POO Noturno" }).getAttribute("href")).toBe(
      `/minhas-turmas/${CLASS.id}/ranking`,
    );
  });

  it("013/US4-3 todos com 0 ponto: as linhas e \"Ainda não há pontos nesta turma.\"", () => {
    renderWithProviders(<RankingCard ranking={{ class: CLASS, top: [row(1, "Ana", 0, true), row(1, "Bia", 0)] }} />);
    expect(screen.getByText(NO_POINTS_YET)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("013/FR-021 sem aluno ativo: \"Esta turma ainda não tem alunos.\"", () => {
    renderWithProviders(<RankingCard ranking={{ class: CLASS, top: [] }} />);
    expect(screen.getByText(NO_STUDENTS)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("013/US4 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<RankingCard ranking={{ class: CLASS, top: TOP }} />);
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [screen.getByRole("link", { name: "Ver ranking completo de POO Noturno" })]);
  });
});
