import type { CohortView } from "@repo/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { CohortFormDialog } from "./cohort-form";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string) => json(status, { statusCode: status, code, message: "texto da API" });

const saved: CohortView = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  description: null,
  status: "ACTIVE",
  activeEnrollmentCount: 0,
  classCount: 0,
  createdAt: "2026-11-18T12:00:00.000Z",
  updatedAt: "2026-11-18T12:00:00.000Z",
};

describe("027/US1-1 CohortFormDialog — criar e editar a turma (FR-001, FR-003, FR-032)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/^Nome/), "ADS 3NA");
    await user.type(screen.getByLabelText(/^Código/), "ADS-3NA");
    const year = screen.getByLabelText(/^Ano letivo/);
    await user.clear(year);
    await user.type(year, "2026");
    await user.type(screen.getByLabelText(/^Período/), "2026.2");
  };

  it("cria a turma com o corpo do contrato e anuncia \"Turma criada.\"", async () => {
    fetchMock.mockResolvedValueOnce(json(201, saved));
    renderWithProviders(<CohortFormDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nova turma" }));
    await expectNoA11yViolations(screen.getByRole("dialog"));
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    expect(await screen.findByText("Turma criada.")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/cohorts");
    expect(JSON.parse(String(init!.body))).toEqual({
      name: "ADS 3NA",
      code: "ADS-3NA",
      academicYear: 2026,
      period: "2026.2",
      description: null,
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("027/US1-2 código em uso no ano → \"Esse código de turma já está em uso.\" no campo Código", async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, "COHORT_CODE_TAKEN"));
    renderWithProviders(<CohortFormDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nova turma" }));
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Criar turma" }));

    const messages = await screen.findAllByText("Esse código de turma já está em uso.");
    expect(messages.length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Código/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("campos vazios não enviam e dizem o que falta", async () => {
    renderWithProviders(<CohortFormDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nova turma" }));
    await user.clear(screen.getByLabelText(/^Ano letivo/));
    await user.click(screen.getByRole("button", { name: "Criar turma" }));
    expect((await screen.findAllByText("Informe o nome da turma.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Informe o código da turma.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Informe o ano letivo.").length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("027/FR-003 edita com os dados atuais e anuncia \"Turma atualizada.\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...saved, name: "ADS 3NB" }));
    renderWithProviders(<CohortFormDialog initial={saved} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const name = screen.getByLabelText(/^Nome/);
    expect((name as HTMLInputElement).value).toBe("ADS 3NA");
    await user.clear(name);
    await user.type(name, "ADS 3NB");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Turma atualizada.")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/cohorts/${saved.id}`);
    expect(init!.method).toBe("PATCH");
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: "ADS 3NB", code: "ADS-3NA", academicYear: 2026 });
  });
});
