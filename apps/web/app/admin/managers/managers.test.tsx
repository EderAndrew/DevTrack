import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvitationView, ManagerView } from "../../../lib/admin-api";
import { expectNoA11yViolations } from "../../../test/a11y";
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
    const { container } = render(<ManagersAdmin initialManagers={MANAGERS} initialInvitations={[invitation()]} />);
    expect(screen.getByRole("button", { name: "Desativar Gestora Ana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reenviar convite para bia@example.test" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("convida enviando só {email, displayName} e mostra o convite", async () => {
    fetchMock.mockResolvedValue(json(201, invitation({ id: "33333333-3333-4333-8333-333333333333", email: "novo@example.test", displayName: "Novo" })));
    render(<ManagersAdmin initialManagers={MANAGERS} initialInvitations={[]} />);
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
      json(403, { statusCode: 403, code: "SELF_INVITE_FORBIDDEN", message: "Você não pode convidar o próprio e-mail." }),
    );
    render(<ManagersAdmin initialManagers={[]} initialInvitations={[]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Eu");
    await user.type(screen.getByLabelText(/^E-mail/), "eu@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível convidar" });
    expect(summary.textContent).toContain("Você não pode convidar o próprio e-mail.");
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^E-mail/).getAttribute("aria-invalid")).toBe("true");
  });

  it("desativar e revogar atualizam as linhas", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ...MANAGERS[0], status: "INACTIVE" }))
      .mockResolvedValueOnce(json(200, invitation({ status: "REVOKED" })));
    render(<ManagersAdmin initialManagers={MANAGERS} initialInvitations={[invitation()]} />);
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
