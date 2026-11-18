import type { EnrollmentView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ClassStudentsTab } from "./class-students-tab";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CLASS_ID = "77777777-7777-4777-8777-777777777777";
let sequence = 0;
const enrollment = (name: string, overrides: Partial<EnrollmentView> = {}): EnrollmentView => {
  sequence += 1;
  const suffix = String(sequence).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    student: { userId: `10000000-0000-4000-8000-${suffix}`, name, email: `aluno${sequence}@example.test`, ra: `RA-${sequence}` },
    status: "ACTIVE",
    enrolledAt: "2026-09-20T15:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
};
const page = (items: EnrollmentView[], nextCursor: string | null = null) => json(200, { items, nextCursor });

describe("003/US6-1 003/US6-2 003/US6-3 ClassStudentsTab (FR-044, FR-045)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista os alunos ativos com RA, e-mail, situação e data da matrícula", async () => {
    const ana = enrollment("Ana Souza");
    fetchMock.mockResolvedValueOnce(page([ana]));
    const { container } = renderWithProviders(<ClassStudentsTab classId={CLASS_ID} />);

    const row = (await screen.findByText("Ana Souza")).closest("tr")!;
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS_ID}/enrollments?status=ACTIVE`);
    for (const text of [ana.student.ra!, ana.student.email, "Ativa", "20/09/2026, 12:00"]) {
      expect(within(row).getByText(text)).toBeTruthy();
    }
    await expectNoA11yViolations(container);
  });

  it("estado vazio: \"Nenhum aluno nesta turma.\"", async () => {
    fetchMock.mockResolvedValueOnce(page([]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} />);
    expect(await screen.findByText("Nenhum aluno nesta turma.")).toBeTruthy();
  });

  it("pesquisa por nome ou RA e filtro de situação no servidor; Carregar mais", async () => {
    const removed = enrollment("Bruno Lima", { status: "REMOVED", removedAt: "2026-09-22T15:00:00.000Z" });
    fetchMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([removed], "c1"))
      .mockResolvedValueOnce(page([enrollment("Bruno Neto", { status: "REMOVED", removedAt: "2026-09-22T15:00:00.000Z" })]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} />);
    const user = userEvent.setup();
    await screen.findByText("Nenhum aluno nesta turma.");

    await user.type(screen.getByLabelText("Pesquisar por nome ou RA"), " bruno ");
    await user.click(screen.getByRole("combobox", { name: "Situação" }));
    await user.click(await screen.findByRole("option", { name: "Removidas" }));
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));

    const row = (await screen.findByText("Bruno Lima")).closest("tr")!;
    expect(within(row).getByText("Removida")).toBeTruthy();
    expect(within(row).getByText("22/09/2026, 12:00")).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/enrollments?query=bruno&status=REMOVED`);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Bruno Neto")).toBeTruthy();
    expect(fetchMock.mock.calls[2]![0]).toBe(`/api/classes/${CLASS_ID}/enrollments?query=bruno&status=REMOVED&cursor=c1`);
  });

  it("027/US4-1 027/FR-021 só leitura: nenhum aluno tem botão Remover, convidar ou incluir", async () => {
    fetchMock.mockResolvedValueOnce(page([enrollment("Ana Souza")]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} />);
    const row = (await screen.findByText("Ana Souza")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover|Convidar|Incluir/ })).toBeNull();
  });
});

describe("003/SC-011 SC-012 — ClassStudentsTab só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação: pesquisa, situação, Pesquisar, Carregar mais", async () => {
    fetchMock.mockResolvedValueOnce(page([enrollment("Ana Souza")], "c1"));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} />);
    const user = userEvent.setup();
    await screen.findByText("Ana Souza");
    await expectTabOrder(user, [
      screen.getByLabelText("Pesquisar por nome ou RA"),
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByRole("button", { name: "Pesquisar" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});
