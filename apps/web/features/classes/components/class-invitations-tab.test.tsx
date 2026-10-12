import type { ClassInvitationView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ClassInvitationsTab } from "./class-invitations-tab";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ statusCode: status, code, message }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const CLASS_ID = "66666666-6666-4666-8666-666666666666";
let sequence = 0;
const invitation = (email: string, overrides: Partial<ClassInvitationView> = {}): ClassInvitationView => {
  sequence += 1;
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    email,
    status: "PENDING",
    expiresAt: "2026-09-30T15:00:00.000Z",
    sendCount: 1,
    lastSentAt: "2026-09-23T15:00:00.000Z",
    delivery: "SENT",
    deliveryIssue: null,
    createdAt: "2026-09-23T15:00:00.000Z",
    ...overrides,
  };
};
const page = (items: ClassInvitationView[], nextCursor: string | null = null) => json(200, { items, nextCursor });

const render = (overrides: Partial<{ canResend: boolean; canCancel: boolean }> = {}) =>
  renderWithProviders(<ClassInvitationsTab classId={CLASS_ID} canResend canCancel {...overrides} />);

describe("003/US5-1 003/US5-2 003/US5-4 ClassInvitationsTab (FR-020–FR-023)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista os pendentes com situação, validade, envios, \"Enviando\" e \"Envio falhou\" (003/FR-019)", async () => {
    const ok = invitation("ana@example.test", { sendCount: 2 });
    const failed = invitation("bruno@example.test", { delivery: "FAILED" });
    const sending = invitation("carla@example.test", { delivery: "SENDING" });
    fetchMock.mockResolvedValueOnce(page([ok, failed, sending]));
    const { container } = render();

    const row = (await screen.findByText("ana@example.test")).closest("tr")!;
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/classes/${CLASS_ID}/invitations?status=PENDING`);
    expect(within(row).getByText("Pendente")).toBeTruthy();
    expect(within(row).getByText("2")).toBeTruthy();
    expect(within(row).getByText("30/09/2026, 12:00")).toBeTruthy();
    const failedRow = screen.getByText("bruno@example.test").closest("tr")!;
    expect(within(failedRow).getByText("Envio falhou")).toBeTruthy();
    expect(within(failedRow).getByRole("button", { name: "Reenviar convite para bruno@example.test" })).toBeTruthy();
    const sendingRow = screen.getByText("carla@example.test").closest("tr")!;
    expect(within(sendingRow).getByText("Enviando")).toBeTruthy();
    expect(within(row).queryByText(/Enviando|Envio falhou/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("estado vazio: \"Nenhum convite pendente.\"", async () => {
    fetchMock.mockResolvedValueOnce(page([]));
    render();
    expect(await screen.findByText("Nenhum convite pendente.")).toBeTruthy();
  });

  it("pesquisa e filtro no servidor; Carregar mais com o cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([invitation("carla@example.test", { status: "CANCELLED" })], "c1"))
      .mockResolvedValueOnce(page([invitation("carlos@example.test", { status: "CANCELLED" })]));
    render();
    const user = userEvent.setup();
    await screen.findByText("Nenhum convite pendente.");

    await user.type(screen.getByLabelText("Pesquisar por e-mail"), " carl ");
    await user.click(screen.getByRole("combobox", { name: "Situação" }));
    await user.click(await screen.findByRole("option", { name: "Cancelados" }));
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));

    const row = (await screen.findByText("carla@example.test")).closest("tr")!;
    expect(within(row).getByText("Cancelado")).toBeTruthy();
    expect(within(row).queryByRole("button")).toBeNull();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/invitations?query=carl&status=CANCELLED`);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("carlos@example.test")).toBeTruthy();
    expect(fetchMock.mock.calls[2]![0]).toBe(`/api/classes/${CLASS_ID}/invitations?query=carl&status=CANCELLED&cursor=c1`);
  });

  it("003/FR-053 reenviar: chama a API, anuncia e recarrega a lista", async () => {
    const pending = invitation("ana@example.test");
    fetchMock
      .mockResolvedValueOnce(page([pending]))
      .mockResolvedValueOnce(json(200, { ...pending, sendCount: 2 }))
      .mockResolvedValue(page([{ ...pending, sendCount: 2 }]));
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reenviar convite para ana@example.test" }));

    expect(await screen.findByText("Convite reenviado.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/invitations/${pending.id}/resend`);
    expect(fetchMock.mock.calls[1]![1]!.method).toBe("POST");
    await waitFor(() => expect(within(screen.getByText("ana@example.test").closest("tr")!).getByText("2")).toBeTruthy());
  });

  it("limite de reenvio: mensagem com o tempo de espera no resumo", async () => {
    const pending = invitation("ana@example.test");
    fetchMock
      .mockResolvedValueOnce(page([pending]))
      .mockResolvedValueOnce(apiError(429, "RATE_LIMITED", "Muitas tentativas.", { "Retry-After": "45" }))
      .mockResolvedValue(page([pending]));
    render();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Reenviar convite para ana@example.test" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível alterar o convite" });
    expect(summary.textContent).toMatch(/1 minuto/);
  });

  it("cancelar pede confirmação: Voltar devolve o foco sem chamar a API; confirmar cancela", async () => {
    const pending = invitation("ana@example.test");
    fetchMock
      .mockResolvedValueOnce(page([pending]))
      .mockResolvedValueOnce(json(200, { ...pending, status: "CANCELLED" }))
      .mockResolvedValue(page([]));
    const { container } = render();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Cancelar convite para ana@example.test" });

    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Cancelar o convite de ana@example.test?" });
    expect(dialog.textContent).toContain("O link enviado deixa de valer");
    await expectNoA11yViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Cancelar convite" }));
    expect(await screen.findByText("Convite cancelado.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/invitations/${pending.id}/cancel`);
    expect(await screen.findByText("Nenhum convite pendente.")).toBeTruthy();
  });

  it("sem permissões: sem Reenviar nem Cancelar", async () => {
    fetchMock.mockResolvedValueOnce(page([invitation("ana@example.test")]));
    render({ canResend: false, canCancel: false });
    const row = (await screen.findByText("ana@example.test")).closest("tr")!;
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("erro de carregamento com Tentar novamente; carregando com aria-busy", async () => {
    fetchMock
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro."))
      .mockResolvedValueOnce(page([invitation("ana@example.test")]));
    const { unmount } = render();
    expect(screen.getByText("Carregando convites…").closest('[aria-busy="true"]')).not.toBeNull();
    unmount();

    render();
    const alert = await screen.findByRole("alert");
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("ana@example.test")).toBeTruthy();
  });
});

describe("017/US2-1 017/US2-2 017/US2-4 017/FR-015 017/FR-016 convite \"Não entregue\" na aba Convites", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("017/US2-1 017/US2-2 017/FR-015 badge \"Não entregue\" com o motivo em palavras, só em convite pendente", async () => {
    const bounced = invitation("ana@example.test", { delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
    const rejected = invitation("bia@example.test", { delivery: "UNDELIVERED", deliveryIssue: "REJECTED" });
    const spam = invitation("bruno@example.test", { delivery: "UNDELIVERED", deliveryIssue: "COMPLAINED" });
    const sent = invitation("carla@example.test");
    fetchMock.mockResolvedValueOnce(page([bounced, rejected, spam, sent]));
    const { container } = render();

    const bouncedRow = (await screen.findByText("ana@example.test")).closest("tr")!;
    const badge = within(bouncedRow).getByText("Não entregue");
    expect(badge.getAttribute("data-variant")).toBe("warning");
    expect(within(bouncedRow).getByText("O endereço não existe ou recusou a mensagem.")).toBeTruthy();
    expect(within(screen.getByText("bia@example.test").closest("tr")!).getByText("O endereço não existe ou recusou a mensagem.")).toBeTruthy();
    const spamRow = screen.getByText("bruno@example.test").closest("tr")!;
    expect(within(spamRow).getByText("Marcado como spam pelo destinatário.")).toBeTruthy();
    expect(within(screen.getByText("carla@example.test").closest("tr")!).queryByText(/Não entregue|Enviando|Envio falhou/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("017/FR-015 um convite aceito ou cancelado não mostra a situação do envio", async () => {
    fetchMock.mockResolvedValueOnce(page([invitation("ana@example.test", { status: "ACCEPTED", delivery: "UNDELIVERED", deliveryIssue: "COMPLAINED" })]));
    render();
    const row = (await screen.findByText("ana@example.test")).closest("tr")!;
    expect(within(row).queryByText(/Não entregue|spam/)).toBeNull();
  });

  it("017/US2-4 017/FR-016 Reenviar num \"Não entregue\" pede confirmação: Voltar não chama a API; Reenviar reenvia", async () => {
    const undelivered = invitation("ana@example.test", { delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
    fetchMock
      .mockResolvedValueOnce(page([undelivered]))
      .mockResolvedValueOnce(json(200, { ...undelivered, delivery: "SENDING", deliveryIssue: null, sendCount: 2 }))
      .mockResolvedValue(page([{ ...undelivered, delivery: "SENDING", deliveryIssue: null, sendCount: 2 }]));
    const { container } = render();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Reenviar convite para ana@example.test" });

    await user.click(trigger);
    const dialog = await screen.findByRole("alertdialog", { name: "Reenviar para o mesmo endereço?" });
    expect(dialog.textContent).toContain("Este endereço já recusou a mensagem. Confira o e-mail antes de reenviar.");
    await expectNoA11yViolations(container.ownerDocument.body);
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reenviar" }));
    expect(await screen.findByText("Convite reenviado.")).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/classes/${CLASS_ID}/invitations/${undelivered.id}/resend`);
  });

  it("017/US2-4 pelo teclado: Enter abre a confirmação e Esc volta sem reenviar", async () => {
    fetchMock.mockResolvedValueOnce(page([invitation("ana@example.test", { delivery: "UNDELIVERED", deliveryIssue: "COMPLAINED" })]));
    render();
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Reenviar convite para ana@example.test" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alertdialog", { name: "Reenviar para o mesmo endereço?" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("017/FR-016 num convite sem problema de entrega o reenvio segue direto, sem confirmação (003)", async () => {
    const failed = invitation("ana@example.test", { delivery: "FAILED" });
    fetchMock.mockResolvedValueOnce(page([failed])).mockResolvedValueOnce(json(200, failed)).mockResolvedValue(page([failed]));
    render();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Reenviar convite para ana@example.test" }));
    expect(await screen.findByText("Convite reenviado.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("003/SC-011 SC-012 — ClassInvitationsTab só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação: pesquisa, situação, Pesquisar, ações da linha, Carregar mais", async () => {
    fetchMock.mockResolvedValueOnce(page([invitation("ana@example.test")], "c1"));
    render();
    const user = userEvent.setup();
    await screen.findByText("ana@example.test");
    await expectTabOrder(user, [
      screen.getByLabelText("Pesquisar por e-mail"),
      screen.getByRole("combobox", { name: "Situação" }),
      screen.getByRole("button", { name: "Pesquisar" }),
      screen.getByRole("button", { name: "Reenviar convite para ana@example.test" }),
      screen.getByRole("button", { name: "Cancelar convite para ana@example.test" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});
