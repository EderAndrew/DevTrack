import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ExerciseBankHome } from "./exercise-bank-home";

describe("010/US1 ExerciseBankHome", () => {
  it("oferece \"Criar manualmente\" e \"Novo exercício\" a quem pode criar, e anuncia o que acabou de salvar", async () => {
    const { container } = renderWithProviders(<ExerciseBankHome canCreate created={3} />);
    expect(screen.getByRole("heading", { level: 1, name: "Banco de Exercícios" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar manualmente" }).getAttribute("href")).toBe("/exercicios/novo");
    expect(screen.getByRole("link", { name: "Novo exercício" }).getAttribute("href")).toBe("/exercicios/novo/avulso");
    expect(screen.getByRole("status").textContent).toBe("3 exercícios salvos.");
    await expectNoA11yViolations(container);
  });

  it("sem questoes.criar não há ações de criação, e sem criados não há aviso", () => {
    renderWithProviders(<ExerciseBankHome canCreate={false} created={0} />);
    expect(screen.queryByRole("link", { name: "Criar manualmente" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
