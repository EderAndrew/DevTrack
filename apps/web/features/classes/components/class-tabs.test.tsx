import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ClassTabs } from "./class-tabs";

const navigation = vi.hoisted(() => ({ pathname: "/turmas/c1" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const tabs = () =>
  within(screen.getByRole("navigation", { name: "Seções da turma" }))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]);

describe("004/US1 ClassTabs — seções da turma", () => {
  beforeEach(() => {
    navigation.pathname = "/turmas/c1";
  });

  it("Alunos, Convites, Ementa, Calendário e Planejamento; a atual com aria-current", async () => {
    navigation.pathname = "/turmas/c1/calendario";
    const { container } = renderWithProviders(<ClassTabs classId="c1" showPlanning />);
    expect(tabs()).toEqual([
      ["Alunos", "/turmas/c1", null],
      ["Convites", "/turmas/c1/convites", null],
      ["Ementa", "/turmas/c1/ementa", null],
      ["Calendário", "/turmas/c1/calendario", "page"],
      ["Planejamento", "/turmas/c1/planejamento", null],
    ]);
    await expectNoA11yViolations(container);
  });

  it("sem planejamento.visualizar mostra só Alunos e Convites; Alunos é a página da turma", () => {
    renderWithProviders(<ClassTabs classId="c1" showPlanning={false} />);
    expect(tabs()).toEqual([
      ["Alunos", "/turmas/c1", "page"],
      ["Convites", "/turmas/c1/convites", null],
    ]);
  });
});
