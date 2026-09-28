import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ExerciseBankHome } from "./exercise-bank-home";
import { exerciseApiMock, json } from "./test-fixtures";

describe("010/US1 ExerciseBankHome", () => {
  beforeEach(() => {
    const reads = exerciseApiMock(() => json(500, {}));
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) =>
      String(input).startsWith("/api/exercises") ? json(200, { items: [], nextCursor: null }) : reads(input, init),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("oferece \"Criar manualmente\" e \"Novo exercício\" a quem pode criar, e anuncia o que acabou de salvar", async () => {
    const { container } = renderWithProviders(<ExerciseBankHome canCreate created={3} />);
    expect(screen.getByRole("heading", { level: 1, name: "Banco de Exercícios" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar manualmente" }).getAttribute("href")).toBe("/exercicios/novo");
    expect(screen.getByRole("link", { name: "Novo exercício" }).getAttribute("href")).toBe("/exercicios/novo/avulso");
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain("3 exercícios salvos.");
    await expectNoA11yViolations(container);
  });

  it("010/US2 com ia.exercicios.gerar oferece \"Criar com IA\" e o caminho para os lotes", () => {
    renderWithProviders(<ExerciseBankHome canCreate canGenerate created={0} />);
    expect(screen.getByRole("link", { name: "Criar com IA" }).getAttribute("href")).toBe("/exercicios/gerar");
    expect(screen.getByRole("link", { name: "Lotes gerados com IA" }).getAttribute("href")).toBe("/exercicios/lotes");
  });

  it("sem questoes.criar não há ações de criação, e sem criados não há aviso", () => {
    renderWithProviders(<ExerciseBankHome canCreate={false} created={0} />);
    expect(screen.queryByRole("link", { name: "Criar manualmente" })).toBeNull();
    expect(screen.queryByText(/salvos?\.$/)).toBeNull();
  });
});
