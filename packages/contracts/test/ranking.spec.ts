import { describe, expect, it } from "vitest";
import { ClassRankingSchema, RANKING_TOP_MAX, RankingRowSchema } from "../src/index.js";

const row = { position: 1, name: "Ana Souza", points: 105, isViewer: true };

describe("013 contrato do ranking da turma (research K12)", () => {
  it("013/SC-007 a linha tem só posição, nome, pontos e o destaque de quem vê: qualquer outro campo é recusado", () => {
    expect(RankingRowSchema.safeParse(row).success).toBe(true);
    for (const field of ["studentUserId", "userId", "email", "enrollment", "ra", "grade", "answers", "activityId"]) {
      expect(RankingRowSchema.safeParse({ ...row, [field]: "x" }).success, field).toBe(false);
    }
  });

  it("posição ≥ 1 e pontos inteiros não negativos", () => {
    for (const bad of [{ position: 0 }, { position: 1.5 }, { points: -1 }, { points: 2.5 }]) {
      expect(RankingRowSchema.safeParse({ ...row, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("o ranking da turma é a turma e as linhas; o painel mostra até 5", () => {
    expect(ClassRankingSchema.safeParse({ class: { id: "00000000-0000-4000-8000-000000000001", name: "Turma A" }, rows: [row] }).success).toBe(true);
    expect(RANKING_TOP_MAX).toBe(5);
  });
});
