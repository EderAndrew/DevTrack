import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvitationView, ManagerView } from "@repo/contracts";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { ManagersAdmin } from "./managers-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const MANAGERS: ManagerView[] = [
  { userId: "11111111-1111-4111-8111-111111111111", name: "Gestora Ana", email: "ana@example.test", status: "ACTIVE" },
];
const invitation = (overrides: Partial<InvitationView> = {}): InvitationView => ({
  id: "22222222-2222-4222-8222-222222222222",
  email: "bia@example.test",
  displayName: "Bia",
  role: "MANAGER",
  status: "PENDING",
  expiresAt: "2026-09-28T12:00:00.000Z",
  sendCount: 1,
  lastSentAt: "2026-09-21T12:00:00.000Z",
  delivery: "SENT",
  deliveryIssue: null,
  invitedBy: { id: "a", name: "Admin" },
  ...overrides,
});

describe("ManagersAdmin (US4, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]?.body)) as unknown;

  it("renderiza gestores e convites sem violações axe", async () => {
    const { container } = renderWithProviders(<ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />);
    expect(screen.getByRole("button", { name: "Desativar Gestora Ana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar convite para bia@example.test" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("convida enviando só {email, displayName} e mostra o convite", async () => {
    fetchMock.mockResolvedValue(json(201, invitation({ id: "33333333-3333-4333-8333-333333333333", email: "novo@example.test", displayName: "Novo" })));
    renderWithProviders(<ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Novo");
    await user.type(screen.getByLabelText(/^E-mail/), "novo@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/manager-invitations");
    expect(bodyOf(0)).toEqual({ email: "novo@example.test", displayName: "Novo" });
    expect(await screen.findByRole("button", { name: "Reenviar convite para novo@example.test" })).toBeTruthy();
  });

  it("erro de negócio vai para o resumo, ligado ao e-mail", async () => {
    fetchMock.mockResolvedValue(
      json(403, { statusCode: 403, code: "SELF_INVITE_FORBIDDEN", message: "Não é possível convidar a si mesmo." }),
    );
    renderWithProviders(<ManagersAdmin initialManagers={{ items: [] }} initialInvitations={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Eu");
    await user.type(screen.getByLabelText(/^E-mail/), "eu@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível convidar" });
    expect(summary.textContent).toContain("Não é possível convidar a si mesmo.");
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^E-mail/).getAttribute("aria-invalid")).toBe("true");
  });

  it("desativar e revogar atualizam as linhas", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ...MANAGERS[0], status: "INACTIVE" }))
      .mockResolvedValueOnce(json(200, invitation({ status: "REVOKED" })));
    renderWithProviders(<ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Desativar Gestora Ana" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/managers/${MANAGERS[0]!.userId}/deactivate`);
    expect(await screen.findByRole("button", { name: "Reativar Gestora Ana" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Revogar convite para bia@example.test" }));
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/manager-invitations/${invitation().id}/revoke`);
    const row = (await screen.findByText("Revogado")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
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
    const { container } = renderWithProviders(<ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />);
    const user = userEvent.setup();
    const nome = screen.getByLabelText(/^Nome/);
    const email = screen.getByLabelText(/^E-mail/);
    const button = screen.getByRole("button", { name: "Enviar convite" });
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Desativar Gestora Ana" }),
      nome,
      email,
      button,
      screen.getByRole("button", { name: "Reenviar convite para bia@example.test" }),
      screen.getByRole("button", { name: "Revogar convite para bia@example.test" }),
    ]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível convidar" }));
    expectFieldErrorLinked(nome);
    expectFieldErrorLinked(email);
    await expectNoA11yViolations(container);
  });

  it("ações de linha só com teclado: falha com foco no resumo, depois reenvio", async () => {
    const { container } = renderWithProviders(<ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />);
    const user = userEvent.setup();

    fetchMock.mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "Transição de estado inválida."));
    await tabTo(user, screen.getByRole("button", { name: "Desativar Gestora Ana" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível concluir" })).toBe(document.activeElement);
    await expectNoA11yViolations(container);

    fetchMock.mockResolvedValueOnce(reply(200, invitation({ sendCount: 2 })));
    await tabTo(user, screen.getByRole("button", { name: "Reenviar convite para bia@example.test" }));
    await user.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls[1]![0]).toBe("/api/manager-invitations/22222222-2222-4222-8222-222222222222/resend"),
    );
  });
});

describe("002/US4-2 e 002/US4-3 ações atualizam as tabelas sem recarregar", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reenviar atualiza a linha e o cache do convite, sem outra requisição", async () => {
    fetchMock.mockResolvedValueOnce(json(200, invitation({ sendCount: 2 })));
    const { queryClient } = renderWithProviders(
      <ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Reenviar convite para bia@example.test" }));

    const row = screen.getByRole("button", { name: "Reenviar convite para bia@example.test" }).closest("tr")!;
    await vi.waitFor(() => expect(within(row).getByText("2")).toBeTruthy());
    expect(queryClient.getQueryData<{ items: InvitationView[] }>(["managers", "invitations"])?.items[0]?.sendCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revogar tira as ações do convite e o cache mostra Revogado", async () => {
    fetchMock.mockResolvedValueOnce(json(200, invitation({ status: "REVOKED" })));
    const { queryClient } = renderWithProviders(
      <ManagersAdmin initialManagers={{ items: MANAGERS }} initialInvitations={{ items: [invitation()] }} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Revogar convite para bia@example.test" }));

    const row = (await screen.findByText("Revogado")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
    expect(queryClient.getQueryData<{ items: InvitationView[] }>(["managers", "invitations"])?.items[0]?.status).toBe("REVOKED");
    expect(queryClient.getQueryState(["managers", "invitations"])?.isInvalidated).toBe(true);
  });

  it("dois cliques em Enviar convite fazem uma só requisição", async () => {
    const release = pendingResponse(fetchMock, () =>
      json(201, invitation({ id: "33333333-3333-4333-8333-333333333333", email: "novo@example.test", displayName: "Novo" })),
    );
    renderWithProviders(<ManagersAdmin initialManagers={{ items: [] }} initialInvitations={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Novo");
    await user.type(screen.getByLabelText(/^E-mail/), "novo@example.test");
    await user.dblClick(screen.getByRole("button", { name: "Enviar convite" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByRole("button", { name: "Reenviar convite para novo@example.test" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText(/^E-mail/) as HTMLInputElement).value).toBe("");
  });

  it("e-mail inválido é apontado no campo antes de enviar (\"Dados inválidos.\")", async () => {
    renderWithProviders(<ManagersAdmin initialManagers={{ items: [] }} initialInvitations={{ items: [] }} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Novo");
    await user.type(screen.getByLabelText(/^E-mail/), "sem-arroba");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById("email-erro")?.textContent).toBe("Dados inválidos.");
  });
});
