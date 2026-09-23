import type { EnrollmentView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { classesKeys } from "../hooks/use-classes";
import { ClassStudentsTab } from "./class-students-tab";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

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
    const { container } = renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);

    const row = (await screen.findByText("Ana Souza")).closest("tr")!;
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS_ID}/enrollments?status=ACTIVE`);
    for (const text of [ana.student.ra!, ana.student.email, "Ativa", "20/09/2026, 12:00"]) {
      expect(within(row).getByText(text)).toBeTruthy();
    }
    await expectNoA11yViolations(container);
  });

  it("estado vazio: \"Nenhum aluno nesta turma.\"", async () => {
    fetchMock.mockResolvedValueOnce(page([]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);
    expect(await screen.findByText("Nenhum aluno nesta turma.")).toBeTruthy();
  });

  it("pesquisa por nome ou RA e filtro de situação no servidor; Carregar mais", async () => {
    const removed = enrollment("Bruno Lima", { status: "REMOVED", removedAt: "2026-09-22T15:00:00.000Z" });
    fetchMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([removed], "c1"))
      .mockResolvedValueOnce(page([enrollment("Bruno Neto", { status: "REMOVED", removedAt: "2026-09-22T15:00:00.000Z" })]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);
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

  it("003/FR-053 remover pede confirmação; Voltar devolve o foco; confirmar remove, anuncia e atualiza a turma", async () => {
    const ana = enrollment("Ana Souza");
    fetchMock
      .mockResolvedValueOnce(page([ana]))
      .mockResolvedValueOnce(json(200, { ...ana, status: "REMOVED", removedAt: "2026-09-23T15:00:00.000Z" }))
      .mockResolvedValue(page([]));
    const { container, queryClient } = renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Remover Ana Souza da turma" });

    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Remover Ana Souza da turma?" });
    expect(dialog.textContent).toContain("A conta do aluno continua existindo");
    await expectNoA11yViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Remover aluno" }));
    expect(await screen.findByText("Aluno removido.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/enrollments/${ana.id}/remove`);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: classesKeys.detail(CLASS_ID) });
    expect(await screen.findByText("Nenhum aluno nesta turma.")).toBeTruthy();
  });

  it("recusa da API (turma arquivada) aparece no resumo", async () => {
    const ana = enrollment("Ana Souza");
    fetchMock
      .mockResolvedValueOnce(page([ana]))
      .mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "Transição inválida."))
      .mockResolvedValue(page([ana]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Remover Ana Souza da turma" }));
    await user.click(await screen.findByRole("button", { name: "Remover aluno" }));
    expect(await screen.findByRole("group", { name: "Não foi possível remover o aluno" })).toBeTruthy();
  });

  it("sem permissão não mostra Remover", async () => {
    fetchMock.mockResolvedValueOnce(page([enrollment("Ana Souza")]));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove={false} />);
    const row = (await screen.findByText("Ana Souza")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

describe("003/SC-011 SC-012 — ClassStudentsTab só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação: pesquisa, situação, Pesquisar, Remover, Carregar mais", async () => {
    fetchMock.mockResolvedValueOnce(page([enrollment("Ana Souza")], "c1"));
    renderWithProviders(<ClassStudentsTab classId={CLASS_ID} canRemove />);
    const user = userEvent.setup();
    await screen.findByText("Ana Souza");
    await expectTabOrder(user, [
      screen.getByLabelText("Pesquisar por nome ou RA"),
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByRole("button", { name: "Pesquisar" }),
      screen.getByRole("button", { name: "Remover Ana Souza da turma" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});
