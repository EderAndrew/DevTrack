import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvitationView, TeacherListItem } from "@repo/contracts";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { TeachersAdmin } from "./teachers-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const TEACHERS: TeacherListItem[] = [
  { userId: null, invitationId: "11111111-1111-4111-8111-111111111111", displayName: "Ana Convidada", email: "ana@example.test", status: "INVITED" },
  { userId: "22222222-2222-4222-8222-222222222222", invitationId: null, displayName: "Bruno Ativo", email: "bruno@example.test", status: "ACTIVE" },
  { userId: "33333333-3333-4333-8333-333333333333", invitationId: null, displayName: "Carla Suspensa", email: "carla@example.test", status: "SUSPENDED" },
  { userId: "44444444-4444-4444-8444-444444444444", invitationId: null, displayName: "Davi Inativo", email: "davi@example.test", status: "INACTIVE" },
];

describe("TeachersAdmin (US5, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const actionsOf = (name: string) =>
    within(screen.getByText(name).closest("tr")!)
      .queryAllByRole("button")
      .map((button) => button.textContent);

  it("oferece as ações de cada situação e não tem violações", async () => {
    const { container } = renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} />);
    expect(actionsOf("Ana Convidada")).toEqual(["Reenviar convite", "Revogar convite"]);
    expect(actionsOf("Bruno Ativo")).toEqual(["Suspender", "Desativar"]);
    expect(actionsOf("Carla Suspensa")).toEqual(["Reativar", "Desativar"]);
    expect(actionsOf("Davi Inativo")).toEqual(["Reativar"]);
    expect(within(screen.getByText("Ana Convidada").closest("tr")!).getByText("Convidado")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("convida enviando só {email, displayName} e recarrega a lista", async () => {
    fetchMock
      .mockResolvedValueOnce(json(201, { id: "x", email: "nova@example.test" }))
      .mockResolvedValueOnce(json(200, { items: TEACHERS }));
    renderWithProviders(<TeachersAdmin initialTeachers={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Nova Prof");
    await user.type(screen.getByLabelText(/^E-mail/), "nova@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/teacher-invitations");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ email: "nova@example.test", displayName: "Nova Prof" });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/teachers");
    expect(await screen.findByText("Bruno Ativo")).toBeTruthy();
  });

  it.each([
    ["ALREADY_TEACHER", "Esta pessoa já é professor."],
    ["TEACHER_REACTIVATION_REQUIRED", "Use a reativação."],
  ])("%s aparece ligado ao e-mail, com foco no resumo", async (code, message) => {
    fetchMock.mockResolvedValueOnce(json(409, { statusCode: 409, code, message }));
    renderWithProviders(<TeachersAdmin initialTeachers={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "X");
    await user.type(screen.getByLabelText(/^E-mail/), "x@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível convidar" });
    expect(summary.textContent).toContain(message);
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^E-mail/).getAttribute("aria-invalid")).toBe("true");
  });

  it("ações chamam a rota certa e o filtro refaz a consulta", async () => {
    fetchMock.mockResolvedValue(json(200, { items: TEACHERS }));
    renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Suspender: Bruno Ativo" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/teachers/${TEACHERS[1]!.userId}/suspend`);
    await user.click(screen.getByRole("button", { name: "Revogar convite: Ana Convidada" }));
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/teacher-invitations/${TEACHERS[0]!.invitationId}/revoke`)).toBe(true);

    fetchMock.mockClear();
    await user.selectOptions(screen.getByLabelText("Situação"), "INACTIVE");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/teachers?status=INACTIVE");
  });
});

describe("SC-012 — acessibilidade e teclado (FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
    });
  const apiError = (status: number, code: string, message: string) => reply(status, { statusCode: status, code, message });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("convite só com teclado: ordem, erros ligados e foco no resumo", async () => {
    const { container } = renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} />);
    const user = userEvent.setup();
    const nome = screen.getByLabelText(/^Nome/);
    const email = screen.getByLabelText(/^E-mail/);
    const button = screen.getByRole("button", { name: "Enviar convite" });
    await expectTabOrder(user, [nome, email, button, screen.getByLabelText("Situação"), screen.getByRole("button", { name: "Suspender: Bruno Ativo" })]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível convidar" }));
    expectFieldErrorLinked(nome);
    expectFieldErrorLinked(email);
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("ação de linha só com teclado: falha com foco no resumo, depois sucesso", async () => {
    const { container } = renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} />);
    const user = userEvent.setup();
    const suspend = screen.getByRole("button", { name: "Suspender: Bruno Ativo" });

    fetchMock.mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "Transição de estado inválida."));
    await tabTo(user, suspend);
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível concluir" })).toBe(document.activeElement);
    await expectNoA11yViolations(container);

    fetchMock.mockResolvedValueOnce(reply(200, {})).mockResolvedValueOnce(reply(200, { items: TEACHERS }));
    await tabTo(user, suspend);
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(fetchMock.mock.calls[1]![0]).toBe("/api/teachers/22222222-2222-4222-8222-222222222222/suspend"));
    expect(fetchMock.mock.calls[1]![1]?.method).toBe("POST");
  });
});

describe("002/US4-2 e 002/US4-3 ações atualizam a lista sem recarregar a página", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("suspender busca a lista de novo e a linha mostra a nova situação", async () => {
    const suspended = TEACHERS.map((item) => (item.displayName === "Bruno Ativo" ? { ...item, status: "SUSPENDED" as const } : item));
    fetchMock
      .mockResolvedValueOnce(
        json(200, { userId: TEACHERS[1]!.userId, displayName: "Bruno Ativo", email: "bruno@example.test", status: "SUSPENDED", invitations: [] }),
      )
      .mockResolvedValueOnce(json(200, { items: suspended }));
    const { queryClient } = renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Suspender: Bruno Ativo" }));

    const row = (await screen.findByRole("button", { name: "Reativar: Bruno Ativo" })).closest("tr")!;
    expect(within(row).getByText("Suspenso")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/teachers");
    expect(queryClient.getQueryData<{ status: string }>(["teachers", "detail", TEACHERS[1]!.userId])?.status).toBe("SUSPENDED");
  });

  it("dois cliques em Enviar convite fazem uma só requisição", async () => {
    const release = pendingResponse(fetchMock, () => json(201, { id: "x", email: "nova@example.test" }));
    renderWithProviders(<TeachersAdmin initialTeachers={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Nova Prof");
    await user.type(screen.getByLabelText(/^E-mail/), "nova@example.test");
    await user.dblClick(screen.getByRole("button", { name: "Enviar convite" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(json(200, { items: TEACHERS }));
    release();
    expect(await screen.findByText("Bruno Ativo")).toBeTruthy();
    // 017: the invitation list is read again after the invite (GET); only one POST went out.
    expect(fetchMock.mock.calls.filter(([url, init]) => url === "/api/teacher-invitations" && init?.method === "POST")).toHaveLength(1);
  });
});

describe("017/US2-1 017/US2-2 017/US2-4 017/FR-015 017/FR-016 professores convidados: situação do envio", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const invitationOf = (item: TeacherListItem, overrides: Partial<InvitationView> = {}): InvitationView => ({
    id: item.invitationId!,
    email: item.email,
    displayName: item.displayName,
    role: "TEACHER",
    status: "PENDING",
    expiresAt: "2026-09-28T12:00:00.000Z",
    sendCount: 1,
    lastSentAt: "2026-09-21T12:00:00.000Z",
    delivery: "SENT",
    deliveryIssue: null,
    invitedBy: { id: "m", name: "Gestora" },
    ...overrides,
  });
  const ANA = TEACHERS[0]!;
  const rowOf = (name: string) => screen.getByText(name).closest("tr")!;
  const renderWith = (invitation: InvitationView) =>
    renderWithProviders(<TeachersAdmin initialTeachers={{ items: TEACHERS }} initialInvitations={{ items: [invitation] }} />);

  it.each([
    ["BOUNCED", "O endereço não existe ou recusou a mensagem."],
    ["COMPLAINED", "Marcado como spam pelo destinatário."],
  ] as const)("017/US2-1 017/US2-2 017/FR-015 convite %s: \"Convidado\" e \"Não entregue\" com o motivo", async (issue, text) => {
    const { container } = renderWith(invitationOf(ANA, { delivery: "UNDELIVERED", deliveryIssue: issue }));
    const row = rowOf("Ana Convidada");
    expect(within(row).getByText("Não entregue").getAttribute("data-variant")).toBe("warning");
    expect(within(row).getByText(text)).toBeTruthy();
    expect(within(rowOf("Bruno Ativo")).queryByText("Não entregue")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each([
    ["SENDING", "Enviando", "neutral"],
    ["FAILED", "Envio falhou", "danger"],
  ] as const)("017/FR-015 lista nova: %s → badge \"%s\" (%s); SENT sem badge", (delivery, label, variant) => {
    const { unmount } = renderWith(invitationOf(ANA, { delivery }));
    expect(within(rowOf("Ana Convidada")).getByText(label).getAttribute("data-variant")).toBe(variant);
    unmount();
    renderWith(invitationOf(ANA));
    expect(within(rowOf("Ana Convidada")).queryByText(/Enviando|Envio falhou|Não entregue/)).toBeNull();
  });

  it("017/US2-4 017/FR-016 Reenviar convite num \"Não entregue\" pede confirmação; Voltar não chama a API", async () => {
    fetchMock.mockResolvedValue(json(200, { items: TEACHERS }));
    renderWith(invitationOf(ANA, { delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" }));
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Reenviar convite: Ana Convidada" });

    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Reenviar para o mesmo endereço?" });
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reenviar" }));
    expect(await screen.findByText("Reenviar convite: Ana Convidada — concluído.")).toBeTruthy();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/teacher-invitations/${ANA.invitationId}/resend`);
  });

  it("017/FR-016 sem problema de entrega, Reenviar convite segue direto (001)", async () => {
    fetchMock.mockResolvedValue(json(200, { items: TEACHERS }));
    renderWith(invitationOf(ANA));
    await userEvent.setup().click(screen.getByRole("button", { name: "Reenviar convite: Ana Convidada" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/teacher-invitations/${ANA.invitationId}/resend`);
  });
});

