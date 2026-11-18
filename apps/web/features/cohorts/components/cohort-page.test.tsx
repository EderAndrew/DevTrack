import type { CohortDetail } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { CohortPage } from "./cohort-page";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ID = "00000000-0000-4000-8000-000000000001";
const detail = (overrides: Partial<CohortDetail> = {}): CohortDetail => ({
  id: ID,
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  description: null,
  status: "ACTIVE",
  activeEnrollmentCount: 30,
  classCount: 2,
  createdAt: "2026-11-18T12:00:00.000Z",
  updatedAt: "2026-11-18T12:00:00.000Z",
  classes: [
    { id: "00000000-0000-4000-8000-000000000002", subjectName: "Banco de Dados", teacherName: "Professora Ada", effectiveStatus: "ACTIVE" },
    { id: "00000000-0000-4000-8000-000000000003", subjectName: "Redes", teacherName: "Professor Turing", effectiveStatus: "INACTIVE" },
  ],
  ...overrides,
});

describe("027/US1-6 CohortPage — a página da turma do gestor (FR-007)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os dados, e na aba Disciplinas cada disciplina com o professor e a situação, sem nada pedagógico", async () => {
    fetchMock.mockResolvedValueOnce(json(200, detail()));
    const { container } = renderWithProviders(<CohortPage id={ID} canEdit canChangeStatus />);

    expect(await screen.findByRole("heading", { level: 1, name: "ADS 3NA" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/cohorts/${ID}`);
    expect(screen.getByRole("tab", { name: "Disciplinas" }).getAttribute("aria-selected")).toBe("true");
    const table = screen.getByRole("table", { name: "Disciplinas da turma" });
    const bd = within(table).getByText("Banco de Dados").closest("tr")!;
    expect(within(bd).getByText("Professora Ada")).toBeTruthy();
    expect(within(bd).getByText("Ativa")).toBeTruthy();
    expect(within(within(table).getByText("Redes").closest("tr")!).getByText("Inativa")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Planejamento|Atividades|Notas|Ranking|Calendário/);
    expect(within(table).queryAllByRole("link")).toEqual([]);
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("turma sem disciplinas diz que nenhuma foi acrescentada", async () => {
    fetchMock.mockResolvedValueOnce(json(200, detail({ classes: [], classCount: 0 })));
    renderWithProviders(<CohortPage id={ID} canEdit canChangeStatus />);
    expect(await screen.findByText("Nenhuma disciplina acrescentada a esta turma ainda.")).toBeTruthy();
  });

  it("027/US1-4 Encerrar e Reativar mudam a situação na hora", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, detail()))
      .mockResolvedValueOnce(json(200, { ...detail(), classes: undefined, status: "INACTIVE" }))
      .mockResolvedValueOnce(json(200, detail({ status: "INACTIVE" })));
    renderWithProviders(<CohortPage id={ID} canEdit canChangeStatus />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Encerrar" }));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`/api/cohorts/${ID}/status`);
    expect(JSON.parse(String(init!.body))).toEqual({ to: "INACTIVE" });
    expect(await screen.findByRole("button", { name: "Reativar" })).toBeTruthy();
  });

  it("027/US1-5 Arquivar pede confirmação dizendo que os convites pendentes serão cancelados; arquivada não oferece ações", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, detail()))
      .mockResolvedValueOnce(json(200, { ...detail(), classes: undefined, status: "ARCHIVED" }))
      .mockResolvedValueOnce(json(200, detail({ status: "ARCHIVED" })));
    renderWithProviders(<CohortPage id={ID} canEdit canChangeStatus />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/convites pendentes serão cancelados/)).toBeTruthy();
    await expectNoA11yViolations(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Arquivar turma" }));
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ to: "ARCHIVED" });

    expect(await screen.findByText("Arquivada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Arquivar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reativar" })).toBeNull();
  });

  it("sem permissões não oferece ações", async () => {
    fetchMock.mockResolvedValueOnce(json(200, detail()));
    renderWithProviders(<CohortPage id={ID} canEdit={false} canChangeStatus={false} />);
    await screen.findByRole("heading", { level: 1, name: "ADS 3NA" });
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar" })).toBeNull();
  });

  it("027/FR-033 nomes de turma, disciplina e professor com HTML aparecem como texto", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, detail({
        name: "<b>Turma</b>",
        classes: [{ id: "00000000-0000-4000-8000-000000000002", subjectName: "<b>BD</b>", teacherName: "<b>Ada</b>", effectiveStatus: "ACTIVE" }],
      })),
    );
    const { container } = renderWithProviders(<CohortPage id={ID} canEdit={false} canChangeStatus={false} />);
    expect(await screen.findByRole("heading", { level: 1, name: "<b>Turma</b>" })).toBeTruthy();
    expect(screen.getByText("<b>BD</b>")).toBeTruthy();
    expect(screen.getByText("<b>Ada</b>")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });
});
