import type { CohortEnrollmentView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { CohortStudentsTab } from "./cohort-students-tab";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ statusCode: status, code, message }), { status, headers: { "Content-Type": "application/json" } });

const COHORT_ID = "66666666-6666-4666-8666-666666666666";
let sequence = 0;
const enrollment = (name: string, overrides: Partial<CohortEnrollmentView> = {}): CohortEnrollmentView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    student: { userId: `11111111-1111-4111-8111-${String(sequence).padStart(12, "0")}`, name, email: `${name.toLowerCase()}@example.test` },
    status: "ACTIVE",
    source: "INVITATION",
    enrolledAt: "2026-09-23T15:00:00.000Z",
    removedAt: null,
    ...overrides,
  };
};
const page = (items: CohortEnrollmentView[]) => json(200, { items, nextCursor: null });

const render = (canRemove = true) => renderWithProviders(<CohortStudentsTab cohortId={COHORT_ID} canRemove={canRemove} />);

describe("027/US5 CohortStudentsTab — Encerrar matrícula (027/FR-014)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("027/US5-1 pede confirmação: Voltar devolve o foco sem chamar a API; confirmar encerra e a lista é lida de novo", async () => {
    const ana = enrollment("Ana");
    fetchMock
      .mockResolvedValueOnce(page([ana]))
      .mockResolvedValueOnce(json(200, { ...ana, status: "REMOVED", removedAt: "2026-09-24T15:00:00.000Z" }))
      .mockResolvedValue(page([]));
    const { container } = render();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Encerrar matrícula de Ana" });

    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Encerrar a matrícula de Ana?" });
    expect(dialog.textContent).toContain("deixa de ver todas as disciplinas desta turma");
    expect(dialog.textContent).toContain("continuam com os professores");
    await expectNoA11yViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Encerrar matrícula" }));
    expect(await screen.findByText("Matrícula de Ana encerrada.")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe(`/api/cohorts/${COHORT_ID}/enrollments/${ana.id}/remove`);
    expect(init?.method).toBe("POST");
    expect(await screen.findByText("Nenhum aluno na turma ainda.")).toBeTruthy();
  });

  it("027/FR-014 uma recusa aparece no resumo de erros; só as matrículas ativas têm o botão; sem permissão, nenhum", async () => {
    const ana = enrollment("Ana");
    const bruno = enrollment("Bruno", { status: "REMOVED", removedAt: "2026-09-24T15:00:00.000Z" });
    fetchMock
      .mockResolvedValueOnce(page([ana, bruno]))
      .mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "x"))
      .mockResolvedValue(page([ana, bruno]));
    const { unmount } = render();
    const user = userEvent.setup();
    const brunoRow = (await screen.findByText("Bruno")).closest("tr")!;
    expect(within(brunoRow).queryByRole("button")).toBeNull();

    await user.click(await screen.findByRole("button", { name: "Encerrar matrícula de Ana" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Encerrar matrícula" }));
    expect(await screen.findByText("Operação não permitida no estado atual.")).toBeTruthy();
    expect(screen.getByText("Não foi possível encerrar a matrícula")).toBeTruthy();
    unmount();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(page([enrollment("Carla")]));
    render(false);
    const row = (await screen.findByText("Carla")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Ações" })).toBeNull();
  });

  it("027/FR-033 nome com HTML aparece como texto no botão e na confirmação", async () => {
    fetchMock.mockResolvedValue(page([enrollment("<b>Eva</b>")]));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Encerrar matrícula de <b>Eva</b>" }));
    expect(await screen.findByRole("alertdialog", { name: "Encerrar a matrícula de <b>Eva</b>?" })).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });
});
