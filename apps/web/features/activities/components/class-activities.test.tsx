import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ClassActivities } from "./class-activities";
import { activity, apiError, CLASS_ID, exerciseActivity, json, routedFetch } from "./test-fixtures";

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

describe("013/US1 ClassActivities — Exercício na lista da turma", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("013/FR-004 Exercício: \"Sem prazo\", \"Concluíram: 12 de 30\" e \"Aguardando correção: 3\", sem resultado liberado", async () => {
    const { instructions: _i, version: _v, outOfScopeTopicCount: _o, source: _s, questions: _q, roster: _r, ...exercise } = exerciseActivity();
    vi.stubGlobal("fetch", routedFetch({ [PATH]: json(200, { items: [exercise] }) }).fetch);
    const { container } = renderWithProviders(<ClassActivities classId={CLASS_ID} canApply />);
    const row = within(await screen.findByRole("table")).getAllByRole("row")[1]!;
    expect(within(row).getByText("Sem prazo")).toBeTruthy();
    expect(within(row).getByText("Concluíram: 12 de 30")).toBeTruthy();
    expect(within(row).getByText("Aguardando correção: 3")).toBeTruthy();
    expect(within(row).queryByText(/Correção pendente|Resultado liberado/)).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe("015/US1 ClassActivities — opções do Trabalho na lista", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("015/FR-006 015/US1-1 o modo controlado e a ajuda da IA aparecem por texto na linha da atividade", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        [PATH]: json(200, {
          items: [
            summary({ executionMode: "CONTROLLED", aiHelp: { allowance: 3 } }),
            summary({ id: "22222222-2222-4222-8222-222222222223", title: "Normal" }),
          ],
        }),
      }).fetch,
    );
    const { container } = renderWithProviders(<ClassActivities classId={CLASS_ID} canApply />);
    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Modo controlado")).toBeTruthy();
    expect(within(rows[0]!).getByText("Ajuda da IA: 3 por aluno")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Modo controlado")).toBeNull();
    expect(within(rows[1]!).queryByText(/Ajuda da IA/)).toBeNull();
    await expectNoA11yViolations(container);
  });
});

describe("016/US1 ClassActivities — chamada do Trabalho na lista", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("016/US1-1 016/FR-006 \"Aguardando chamada\" e \"n de m presentes\" por texto; Exercícios e trabalhos antigos sem nada novo", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        [PATH]: json(200, {
          items: [
            summary({ releaseMode: "PRESENT_ONLY", attendance: { present: 0, enrolled: 3 } }),
            summary({ id: "22222222-2222-4222-8222-222222222223", title: "Com chamada", releaseMode: "PRESENT_ONLY", attendance: { present: 2, enrolled: 3 } }),
            summary({ id: "22222222-2222-4222-8222-222222222224", title: "Antigo" }),
          ],
        }),
      }).fetch,
    );
    const { container } = renderWithProviders(<ClassActivities classId={CLASS_ID} canApply />);
    const rows = within(await screen.findByRole("table")).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Aguardando chamada")).toBeTruthy();
    expect(within(rows[1]!).getByText("2 de 3 presentes")).toBeTruthy();
    expect(within(rows[2]!).queryByText(/chamada|presentes/)).toBeNull();
    await expectNoA11yViolations(container);
  });
});
