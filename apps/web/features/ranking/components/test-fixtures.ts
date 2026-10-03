import type { ClassRanking, RankingRow } from "@repo/contracts";

export const CLASS = { id: "11111111-1111-4111-8111-111111111111", name: "POO Noturno" };

export const row = (position: number, name: string, points: number, isViewer = false): RankingRow => ({ position, name, points, isViewer });

/** Seven students with a tie (2º, 2º) and two without points (6º, 6º); the viewer is Davi. */
export const SEVEN: RankingRow[] = [
  row(1, "Ana Lima", 105),
  row(2, "Bruno Alves", 60),
  row(2, "Carla Dias", 60),
  row(4, "Davi Rocha", 45, true),
  row(5, "Elisa Melo", 30),
  row(6, "Fábio Nunes", 0),
  row(6, "Gabi Souza", 0),
];

export const classRanking = (rows: RankingRow[] = SEVEN): ClassRanking => ({ class: CLASS, rows });
