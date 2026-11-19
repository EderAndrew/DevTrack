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

const SUBJECT = { id: "33333333-3333-4333-8333-333333333333", name: "Banco de Dados" };

const CLASS: ClassView = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "Noturno",
  description: null,
  status: "ACTIVE",
  activeStudentCount: 3,
  subject: SUBJECT,
  startsOn: "2026-02-02",
  endsOn: "2026-06-30",
  plannable: true,
  planStatus: null,
  cohort: { id: "99999999-9999-4999-8999-999999999999", name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "Noturno" },
  ownStatus: "ACTIVE",
  effectiveStatus: "ACTIVE",
  canChangeStatus: false,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};
const ENDED: ClassView = { ...CLASS, canChangeStatus: true };

const render = (overrides: Partial<{ canEdit: boolean; canChangeStatus: boolean }> = {}) =>
  renderWithProviders(<ClassDetails id={CLASS.id} canEdit canChangeStatus {...overrides} />);

describe("003/US1-5 004/US1-3 027/US4 ClassDetails — a disciplina da turma (FR-021, FR-022)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("027/US4-1 título \"<disciplina> · <turma>\", os dados da turma, o calendário e nenhuma ação de turma", async () => {
    fetchMock.mockResolvedValueOnce(json(200, CLASS));
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: "Banco de Dados · ADS 3NA" })).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS.id}`);
    for (const text of ["ADS-3NA", "2026", "Noturno", "3", "Ativa", "02/02/2026 a 30/06/2026"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: SUBJECT.name }).getAttribute("href")).toBe(`/disciplinas/${SUBJECT.id}`);
    expect(screen.getByRole("link", { name: "Editar calendário" }).getAttribute("href")).toBe(`/turmas/${CLASS.id}/editar`);
    for (const name of [/Convidar/, /Encerrar/, /Arquivar/, /Inativar/, /Remover/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    await expectNoA11yViolations(container);
  });

  it("027/US4-5 antes do fim do calendário não há Encerrar nem Arquivar; depois, as duas", async () => {
    fetchMock.mockResolvedValueOnce(json(200, ENDED));
    render();
    expect(await screen.findByRole("button", { name: "Encerrar disciplina" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Arquivar disciplina" })).toBeTruthy();
  });

  it("encerra e reativa a disciplina da turma; a situação é atualizada", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, ENDED))
      .mockResolvedValue(json(200, { ...ENDED, status: "INACTIVE", ownStatus: "INACTIVE", effectiveStatus: "INACTIVE" }));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Encerrar disciplina" }));

    expect(await screen.findByRole("button", { name: "Reativar" })).toBeTruthy();
    expect(screen.getByText("Inativa")).toBeTruthy();
    expect(screen.getByText("Disciplina da turma encerrada.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS.id}/status`);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ status: "INACTIVE" });
  });

  it("arquivar pede confirmação; Cancelar não chama a API e devolve o foco", async () => {
    fetchMock.mockResolvedValueOnce(json(200, ENDED));
    const { container } = render();
    const user = userEvent.setup();
    const archive = await screen.findByRole("button", { name: "Arquivar disciplina" });
    await user.click(archive);

    const dialog = await screen.findByRole("alertdialog", { name: "Arquivar Banco de Dados da turma ADS 3NA?" });
    expect(dialog.textContent).toContain("A turma e as outras disciplinas dela não mudam.");
    await expectNoA11yViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(archive);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("arquivar confirmado: \"Disciplina da turma arquivada.\", sem ações de situação nem Editar calendário", async () => {
    const archived = { ...ENDED, status: "ARCHIVED", ownStatus: "ARCHIVED", effectiveStatus: "ARCHIVED", canChangeStatus: false } as const;
    fetchMock.mockResolvedValueOnce(json(200, ENDED)).mockResolvedValue(json(200, archived));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Arquivar disciplina" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Arquivar disciplina" }));

    expect(await screen.findByText("Arquivada")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ status: "ARCHIVED" });
    expect(screen.queryByRole("button", { name: "Encerrar disciplina" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Editar calendário" })).toBeNull();
  });

  it("turma arquivada pelo gestor: situação efetiva arquivada, sem ações", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...ENDED, status: "ARCHIVED", effectiveStatus: "ARCHIVED", canChangeStatus: false }));
    render();
    expect(await screen.findByText("Arquivada")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arquivar disciplina" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Editar calendário" })).toBeNull();
  });

  it("recusa da API (calendário ainda não terminou) aparece no resumo", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, ENDED))
      .mockResolvedValueOnce(apiError(409, "CLASS_CALENDAR_NOT_ENDED", "x"));
    render();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Encerrar disciplina" }));
    const group = await screen.findByRole("group", { name: "Não foi possível alterar a situação" });
    expect(group.textContent).toContain("A disciplina só pode ser encerrada ou arquivada depois do último dia do calendário.");
  });

  it("027/FR-033 nomes com HTML aparecem como texto; disciplina migrada sem disciplina mostra só a turma", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { ...CLASS, subject: { ...SUBJECT, name: "<b>s</b>" }, cohort: { ...CLASS.cohort, name: "<b>t</b>" } }),
    );
    const { container, unmount } = render();
    expect(await screen.findByRole("heading", { level: 1, name: "<b>s</b> · <b>t</b>" })).toBeTruthy();
    expect(container.querySelector("h1 b")).toBeNull();
    unmount();

    fetchMock.mockResolvedValueOnce(json(200, { ...CLASS, subject: null }));
    render();
    expect(await screen.findByRole("heading", { level: 1, name: "ADS 3NA" })).toBeTruthy();
    expect(screen.getByText("Não informada")).toBeTruthy();
  });

  it("sem permissões não mostra ações; disciplina da turma inexistente mostra o erro", async () => {
    fetchMock.mockResolvedValueOnce(json(200, ENDED));
    const { unmount } = render({ canEdit: false, canChangeStatus: false });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: "Editar calendário" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar disciplina" })).toBeNull();
    unmount();

    fetchMock.mockResolvedValueOnce(apiError(404, "NOT_FOUND", "Recurso não encontrado."));
    render();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
