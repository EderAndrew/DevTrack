import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ClassActivities } from "./class-activities";
import { activity, apiError, CLASS_ID, json, routedFetch } from "./test-fixtures";

const PATH = `GET /api/classes/${CLASS_ID}/activities`;
const summary = (overrides: object) => {
  const { instructions: _i, version: _v, outOfScopeTopicCount: _o, source: _s, questions: _q, roster: _r, ...rest } = activity();
  return { ...rest, ...overrides };
};

describe("012/US1 ClassActivities — atividades da turma", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US1-4 lista título, tipo, situação em palavras, prazo e entregas; Nova atividade", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        [PATH]: json(200, {
          items: [
            summary({}),
            summary({ id: "22222222-2222-4222-8222-222222222223", title: "Exercícios agendados", type: "EXERCISE", phase: "SCHEDULED" }),
            summary({ id: "22222222-2222-4222-8222-222222222224", title: "Cancelada", status: "CANCELLED", phase: null, resultReleasedAt: "2026-10-05T12:00:00.000Z" }),
          ],
        }),
      }).fetch,
    );
    const { container } = renderWithProviders(<ClassActivities classId={CLASS_ID} canApply />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("link", { name: "Lista de herança" }).getAttribute("href")).toBe(
      `/turmas/${CLASS_ID}/atividades/${activity().id}`,
    );
    expect(within(rows[0]!).getByText("Publicada")).toBeTruthy();
    expect(within(rows[0]!).getByText("12 de 30")).toBeTruthy();
    expect(within(rows[0]!).getByText("Correção pendente: 3")).toBeTruthy();
    expect(within(rows[1]!).getByText("Agendada")).toBeTruthy();
    expect(within(rows[1]!).getByText("Exercício")).toBeTruthy();
    expect(within(rows[2]!).getByText("Cancelada", { selector: "[data-slot=status]" })).toBeTruthy();
    expect(within(rows[2]!).getByText("Resultado liberado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nova atividade" }).getAttribute("href")).toBe(`/turmas/${CLASS_ID}/atividades/nova`);
    await expectNoA11yViolations(container);
  });

  it("vazia: convida a aplicar; sem atividades.aplicar não oferece a ação", async () => {
    vi.stubGlobal("fetch", routedFetch({ [PATH]: json(200, { items: [] }) }).fetch);
    renderWithProviders(<ClassActivities classId={CLASS_ID} canApply={false} />);
    expect(await screen.findByText("Nenhuma atividade nesta turma.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Nova atividade" })).toBeNull();
  });

  it("erro: mensagem e Tentar novamente", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      routedFetch({ [PATH]: () => (++calls === 1 ? apiError(500, "INTERNAL_ERROR", "Erro interno.") : json(200, { items: [] })) }).fetch,
    );
    renderWithProviders(<ClassActivities classId={CLASS_ID} canApply />);
    await screen.findByRole("alert");
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma atividade nesta turma.")).toBeTruthy();
  });
});
