import type { MyClassView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { MyClasses } from "./my-classes";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const ALGEBRA: MyClassView = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Álgebra",
  code: "ALG-1",
  academicYear: 2026,
  period: "Manhã",
  teacherName: "Professora Ada",
  enrolledAt: "2026-09-20T15:00:00.000Z",
};
const FISICA: MyClassView = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Física",
  code: "FIS-1",
  academicYear: 2025,
  period: null,
  teacherName: "Professor Caio",
  enrolledAt: "2026-09-21T15:00:00.000Z",
};

describe("003/US7-1 003/SC-011 MyClasses — Minhas turmas (FR-038)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista as turmas com código, ano, período, professor e data de entrada; sem aviso de boas-vindas", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [FISICA, ALGEBRA] }));
    const { container } = renderWithProviders(<MyClasses welcome={false} />);

    const row = (await screen.findByText("Álgebra")).closest("tr")!;
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/me/classes");
    for (const text of ["ALG-1", "2026", "Manhã", "Professora Ada", "20/09/2026, 12:00"]) {
      expect(within(row).getByText(text)).toBeTruthy();
    }
    const fisica = screen.getByText("Física").closest("tr")!;
    expect(within(fisica).getByText("—")).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1).map((r) => r.firstElementChild!.textContent);
    expect(rows).toEqual(["Física", "Álgebra"]);
    expect(screen.queryByText("Você agora faz parte da turma.")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("estado vazio", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [] }));
    renderWithProviders(<MyClasses welcome={false} />);
    expect(await screen.findByText("Você ainda não participa de nenhuma turma.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("vindo do aceite: anuncia \"Você agora faz parte da turma.\"", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [ALGEBRA] }));
    const { container } = renderWithProviders(<MyClasses welcome />);
    const notice = screen.getByRole("status");
    expect(within(notice).getByRole("heading", { name: "Você agora faz parte da turma." })).toBeTruthy();
    await screen.findByText("Álgebra");
    await expectNoA11yViolations(container);
  });

  it("falha ao carregar: mensagem e Tentar novamente", async () => {
    fetchMock
      .mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro."))
      .mockResolvedValueOnce(json(200, { items: [ALGEBRA] }));
    renderWithProviders(<MyClasses welcome={false} />);
    const alert = await screen.findByRole("alert");
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Álgebra")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
