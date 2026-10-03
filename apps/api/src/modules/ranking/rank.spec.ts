import { describe, expect, it } from "vitest";
import { rankClass, type RankInput } from "./rank";

const student = (name: string, points: number, isViewer = false): RankInput => ({ name, points, isViewer });

describe("013/FR-019 ranking da turma (research K11)", () => {
  it("013/FR-019 por pontos, do maior para o menor", () => {
    expect(rankClass([student("Bia", 15), student("Caio", 105), student("Ana", 60)]).map((row) => [row.position, row.name, row.points])).toEqual([
      [1, "Caio", 105],
      [2, "Ana", 60],
      [3, "Bia", 15],
    ]);
  });

  it("013/FR-019 empate divide a posição e a seguinte pula (1, 2, 2, 4), em ordem alfabética pt-BR sem acento nem caixa", () => {
    const rows = rankClass([student("Érica", 30), student("caio", 30), student("Davi", 0), student("Ana", 45), student("bruno", 30)]);
    expect(rows.map((row) => [row.position, row.name])).toEqual([
      [1, "Ana"],
      [2, "bruno"],
      [2, "caio"],
      [2, "Érica"],
      [5, "Davi"],
    ]);
  });

  it("acento e caixa não mudam a ordem: Ávila vem antes de Bruno e depois de Ana", () => {
    expect(rankClass([student("Bruno", 0), student("Ávila", 0), student("ana", 0)]).map((row) => row.name)).toEqual(["ana", "Ávila", "Bruno"]);
  });

  it("013/FR-019 turma sem pontos: todos em 1º com 0, incluindo quem nunca fez nada", () => {
    expect(rankClass([student("Bia", 0), student("Ana", 0)])).toEqual([
      { position: 1, name: "Ana", points: 0, isViewer: false },
      { position: 1, name: "Bia", points: 0, isViewer: false },
    ]);
    expect(rankClass([])).toEqual([]);
  });

  it("013/FR-021 a linha de quem vê fica marcada; a ordem não depende dela", () => {
    const rows = rankClass([student("Bia", 30, true), student("Ana", 30)]);
    expect(rows.map((row) => [row.name, row.isViewer])).toEqual([
      ["Ana", false],
      ["Bia", true],
    ]);
  });

  it("determinístico: a ordem da entrada não muda o resultado", () => {
    const input = [student("Caio", 30), student("Ana", 30), student("Bia", 60), student("Davi", 0)];
    expect(rankClass([...input].reverse())).toEqual(rankClass(input));
  });
});
