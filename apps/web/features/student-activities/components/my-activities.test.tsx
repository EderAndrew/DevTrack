import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime } from "@/lib/messages/dates";
import type { StudentActivityListFilters } from "../api/student-activities";
import { filtersFromSearch } from "../schemas/student-activity";
import { LOAD_ERROR } from "./load-states";
import { FILTER_IDS, MyActivities } from "./my-activities";
import { apiError, json, routedFetch, summary } from "./test-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NONE: StudentActivityListFilters = { status: null, type: null };

function setup(routes: Parameters<typeof routedFetch>[0], filters = NONE) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<MyActivities filters={filters} />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US2 Minhas atividades", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("012/US2-4 012/FR-012 cada item: título, resumo, tipo, turma/disciplina, professor, publicação, prazo, situação, nota e feedback", async () => {
    const graded = summary({
      title: "Trabalho de interfaces",
      type: "ASSIGNMENT",
      status: "GRADED",
      late: true,
      canAnswer: false,
      submittedAt: "2026-10-04T10:00:00.000Z",
      result: { grade: "0.90", hasFeedback: true },
    });
    setup({ "GET /api/me/activities": json(200, { items: [graded], nextCursor: null }) });
    const card = (await screen.findByRole("heading", { name: "Trabalho de interfaces" })).closest("article") as HTMLElement;
    for (const text of [
      "Resolva os exercícios de herança.",
      "Trabalho",
      "POO Noturno · Programação Orientada a Objetos",
      "Ana Professora",
      formatLongDateTime(graded.publishedAt),
      formatLongDateTime(graded.deadline),
      "Corrigida com atraso",
      "0,90 de 1,00",
      "Com feedback",
    ]) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(within(card).getByRole("link", { name: "Ver resultado" })).toBeTruthy();
  });

  it("012/US2-4 filtros na URL: Atrasadas + Trabalho pede à API status e tipo", async () => {
    const { user, api } = setup(
      {
        "GET /api/me/activities?status=OVERDUE&type=ASSIGNMENT": json(200, {
          items: [summary({ title: "Atrasado", type: "ASSIGNMENT", status: "OVERDUE", canAnswer: false })],
          nextCursor: null,
        }),
      },
      { status: "OVERDUE", type: "ASSIGNMENT" },
    );
    expect(await screen.findByRole("heading", { name: "Atrasado" })).toBeTruthy();
    expect(api.calls.map((call) => call.url)).toEqual(["/api/me/activities?status=OVERDUE&type=ASSIGNMENT"]);
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("OVERDUE");

    await user.selectOptions(screen.getByLabelText("Tipo"), "Todos");
    expect(router.replace).toHaveBeenLastCalledWith("/minhas-atividades?situacao=atrasadas");
    await user.selectOptions(screen.getByLabelText("Situação"), "Entregues/concluídas");
    expect(router.replace).toHaveBeenLastCalledWith("/minhas-atividades?situacao=concluidas&tipo=trabalho");

    expect(filtersFromSearch({ situacao: "atrasadas", tipo: "trabalho" })).toEqual({ status: "OVERDUE", type: "ASSIGNMENT" });
    expect(filtersFromSearch({ situacao: "qualquer", tipo: "EXAM" })).toEqual(NONE);
  });

  it("012/FR-012 \"Carregar mais\" pede a página seguinte pelo cursor e junta os itens", async () => {
    const { user } = setup({
      "GET /api/me/activities": json(200, { items: [summary({ title: "Primeira" })], nextCursor: "c1" }),
      "GET /api/me/activities?cursor=c1": json(200, { items: [summary({ title: "Segunda" })], nextCursor: null }),
    });
    await screen.findByRole("heading", { name: "Primeira" });
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("heading", { name: "Segunda" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Primeira" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("012/SC-010 lista vazia e falha são mensagens diferentes", async () => {
    const empty = setup({ "GET /api/me/activities": json(200, { items: [], nextCursor: null }) });
    expect(await screen.findByText("Você ainda não tem atividades.")).toBeTruthy();
    empty.unmount();
    setup({ "GET /api/me/activities?status=PENDING": json(200, { items: [], nextCursor: null }) }, { status: "PENDING", type: null });
    expect(await screen.findByText("Nenhuma atividade com esses filtros.")).toBeTruthy();
    vi.unstubAllGlobals();
    setup({ "GET /api/me/activities": apiError(500, "INTERNAL_ERROR", "Erro.") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
  });

  it("012/US2 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { container, user } = setup({ "GET /api/me/activities": json(200, { items: [summary({ title: "Única" })], nextCursor: "c1" }) });
    await screen.findByRole("heading", { name: "Única" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      document.getElementById(FILTER_IDS.status)!,
      document.getElementById(FILTER_IDS.type)!,
      screen.getByRole("link", { name: "Iniciar" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});
