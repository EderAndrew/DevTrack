import type { ClassView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ClassDetails } from "./class-details";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const CLASS: ClassView = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Estruturas de Dados",
  code: "ED-1",
  academicYear: 2026,
  period: "1º semestre",
  description: "Listas, pilhas e filas.",
  status: "ACTIVE",
  activeStudentCount: 3,
  subject: null,
  startsOn: null,
  endsOn: null,
  plannable: false,
  planStatus: null,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

const render = (overrides: Partial<{ canEdit: boolean; canChangeStatus: boolean; canInvite: boolean }> = {}) =>
  renderWithProviders(<ClassDetails id={CLASS.id} canEdit canChangeStatus canInvite {...overrides} />);

describe("003/US1-5 004/US1-3 ClassDetails — dados, oferta e situação (FR-004, FR-005, FR-008)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os dados, o nº de alunos ativos e as ações", async () => {
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: CLASS.name })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS.id}`);
    for (const text of ["ED-1", "2026", "1º semestre", "3", "Listas, pilhas e filas.", "Ativa"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText("Não informada")).toBeTruthy();
    expect(screen.getByText("Não informadas")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Editar" }).getAttribute("href")).toBe(`/turmas/${CLASS.id}/editar`);
    expect(screen.getByRole("button", { name: "Inativar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Convidar aluno" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("004/US1-3 mostra a disciplina (com link) e as datas da oferta", async () => {
    const subject = { id: "33333333-3333-4333-8333-333333333333", name: "Programação Orientada a Objetos" };
    fetchMock.mockResolvedValueOnce(
      json(200, { ...CLASS, subject, startsOn: "2026-02-02", endsOn: "2026-06-30", plannable: true }),
    );
    render();
    const link = await screen.findByRole("link", { name: subject.name });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${subject.id}`);
    expect(screen.getByText("02/02/2026 a 30/06/2026")).toBeTruthy();
  });

  it("inativa e reativa; a situação é atualizada", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, CLASS))
      .mockResolvedValue(json(200, { ...CLASS, status: "INACTIVE" }));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Inativar" }));

    expect(await screen.findByRole("button", { name: "Reativar" })).toBeTruthy();
    expect(screen.getByText("Inativa")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS.id}/status`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ status: "INACTIVE" });
  });

  it("arquivar pede confirmação; Cancelar não chama a API e devolve o foco", async () => {
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    render();
    const user = userEvent.setup();
    const archive = await screen.findByRole("button", { name: "Arquivar" });
    await user.click(archive);

    const dialog = await screen.findByRole("alertdialog", { name: `Arquivar a turma ${CLASS.name}?` });
    expect(dialog.textContent).toContain("Os convites pendentes serão cancelados");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(archive);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("arquivar confirmado: sem ações de situação nem Editar", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, CLASS))
      .mockResolvedValue(json(200, { ...CLASS, status: "ARCHIVED" }));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));
    await user.click(await screen.findByRole("button", { name: "Arquivar turma" }));

    expect(await screen.findByText("Arquivada")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ status: "ARCHIVED" });
    expect(screen.queryByRole("button", { name: "Inativar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Convidar aluno" })).toBeNull();
  });

  it("003/US2-7 turma inativa não oferece Convidar aluno", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...CLASS, status: "INACTIVE" }));
    render();
    expect(await screen.findByRole("button", { name: "Reativar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Convidar aluno" })).toBeNull();
  });

  it("recusa da API aparece no resumo", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, CLASS))
      .mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "Transição de estado inválida."));
    render();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Inativar" }));
    expect(await screen.findByRole("group", { name: "Não foi possível alterar a situação" })).toBeTruthy();
  });

  it("sem permissões não mostra ações; turma inexistente mostra o erro", async () => {
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    const { unmount } = render({ canEdit: false, canChangeStatus: false, canInvite: false });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Convidar aluno" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Inativar" })).toBeNull();
    unmount();

    fetchMock.mockResolvedValueOnce(apiError(404, "NOT_FOUND", "Recurso não encontrado."));
    render();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
