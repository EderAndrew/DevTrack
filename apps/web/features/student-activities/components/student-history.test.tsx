import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime } from "@/lib/messages/dates";
import { LOAD_ERROR } from "./load-states";
import { HISTORY_EMPTY, StudentHistory } from "./student-history";
import { apiError, json, routedFetch, summary } from "./test-fixtures";

const LIST = "GET /api/me/activities?status=COMPLETED";

function setup(routes: Parameters<typeof routedFetch>[0]) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<StudentHistory />);
  return { ...view, api, user: userEvent.setup() };
}

const graded = summary({
  id: "bbbbbbbb-0000-4000-8000-000000000011",
  title: "Trabalho de interfaces",
  type: "ASSIGNMENT",
  status: "GRADED",
  late: true,
  canAnswer: false,
  submittedAt: "2026-10-04T10:00:00.000Z",
  totalGrade: "1.00",
  result: { grade: "0.90", hasFeedback: true },
});
const waiting = summary({
  id: "bbbbbbbb-0000-4000-8000-000000000012",
  title: "Lista de herança",
  status: "SUBMITTED",
  canAnswer: false,
  submittedAt: "2026-10-03T10:00:00.000Z",
  result: null,
});

describe("012/US6 Histórico", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US6-2 012/FR-031 atividade, tipo, turma, entregue em (com atraso), situação, nota e Com feedback; abre a atividade", async () => {
    setup({ [LIST]: json(200, { items: [graded, waiting], nextCursor: null }) });
    const table = await screen.findByRole("table", { name: "Atividades que você entregou." });
    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first!).getByRole("link", { name: "Trabalho de interfaces" }).getAttribute("href")).toBe(`/minhas-atividades/${graded.id}`);
    expect(within(first!).getByText("Trabalho")).toBeTruthy();
    expect(within(first!).getByText(`${formatLongDateTime("2026-10-04T10:00:00.000Z")} (com atraso)`)).toBeTruthy();
    expect(within(first!).getByText("0,90 de 1,00")).toBeTruthy();
    expect(within(first!).getByText("Com feedback")).toBeTruthy();
    expect(within(second!).getByText("Aguardando correção")).toBeTruthy();
    expect(within(second!).queryByText("Com feedback")).toBeNull();
  });

  it("012/US6-1 vazio e erro são estados distintos", async () => {
    setup({ [LIST]: json(200, { items: [], nextCursor: null }) });
    expect(await screen.findByText(HISTORY_EMPTY)).toBeTruthy();
    vi.unstubAllGlobals();
    setup({ [LIST]: apiError(500, "INTERNAL_ERROR", "x") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("012/SC-009 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup({ [LIST]: json(200, { items: [graded, waiting], nextCursor: null }) });
    await screen.findByRole("table");
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Trabalho de interfaces" }),
      screen.getByRole("link", { name: "Lista de herança" }),
    ]);
  });
});
