import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { expectTokenNotKept, pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { ResetPasswordForm } from "./reset-password-form";

const TOKEN = "p".repeat(43);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("ResetPasswordForm (US8-2, US8-4, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/redefinir-senha?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const fill = async (password: string, confirmation = password) => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nova senha/), password);
    await user.type(screen.getByLabelText(/^Confirme a nova senha/), confirmation);
    await user.click(screen.getByRole("button", { name: "Redefinir senha" }));
  };

  it("tira o token da URL, envia só {token, password} e confirma", async () => {
    fetchMock.mockResolvedValue(json(200, { message: "Senha redefinida. Entre com a nova senha." }));
    const { container } = renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    expect(window.location.search).toBe("");
    expect(screen.getByText(/todas as sessões abertas da sua conta serão encerradas/)).toBeTruthy();
    await expectNoA11yViolations(container);

    await fill("Nova-senha-muito-segura-1");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/password-reset/confirm");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ token: TOKEN, password: "Nova-senha-muito-segura-1" });
    expect(await screen.findByRole("heading", { name: "Senha redefinida" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar");
  });

  it("confirmação divergente ou senha curta não envia", async () => {
    renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    await fill("Nova-senha-muito-segura-1", "Outra-senha-muito-segura-1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Confirme a nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("001/FR-011a a dica é a regra do convite e uma senha sem maiúscula, minúscula, número ou caractere especial não envia", async () => {
    renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    expect(screen.getByText(/De 8 a 128 caracteres, com pelo menos 1 letra maiúscula, 1 minúscula, 1 número e 1 caractere especial/)).toBeTruthy();
    // Valid under the old rule (12+ characters, no composition): refused now, before any request.
    await fill("nova-senha-muito-segura");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("WEAK_PASSWORD fica ligado ao campo, com foco no resumo", async () => {
    fetchMock.mockResolvedValue(json(400, { statusCode: 400, code: "WEAK_PASSWORD", message: "A senha não atende às regras indicadas no campo ou é uma senha comum." }));
    renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    await fill("Senha-comum-demais-1");
    const summary = await screen.findByRole("group", { name: "Não foi possível redefinir" });
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^Nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("TOKEN_INVALID e ausência de token levam ao pedido de novo link", async () => {
    fetchMock.mockResolvedValue(json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." }));
    const { container, unmount } = renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    await fill("Nova-senha-muito-segura-1");
    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir um novo link" }).getAttribute("href")).toBe("/esqueci-senha");
    await expectNoA11yViolations(container);
    unmount();

    renderWithProviders(<ResetPasswordForm token={null} />);
    expect(screen.getByText("O link de redefinição está incompleto.")).toBeTruthy();
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

  it("só com teclado: confirmação divergente ligada ao campo, foco no resumo e redefinição", async () => {
    fetchMock.mockResolvedValue(reply(200, { message: "Senha redefinida. Entre com a nova senha." }));
    const { container } = renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    const user = userEvent.setup();
    const senha = screen.getByLabelText(/^Nova senha/);
    const confirmacao = screen.getByLabelText(/^Confirme a nova senha/);
    const button = screen.getByRole("button", { name: "Redefinir senha" });
    await expectTabOrder(user, [senha, confirmacao, button]);

    await tabTo(user, senha);
    await user.keyboard("Nova-senha-muito-segura-1{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível redefinir" }));
    expectFieldErrorLinked(confirmacao);
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);

    await tabTo(user, confirmacao);
    await user.keyboard("Nova-senha-muito-segura-1{Enter}");
    const heading = await screen.findByRole("heading", { name: "Senha redefinida" });
    expect(document.activeElement).toBe(heading.closest('[role="status"]'));
  });
});

describe("002/US4-3 e 002/FR-027 envio duplicado e token", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/redefinir-senha?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dois cliques seguidos em Redefinir senha fazem uma só requisição; o token não fica em cache nem storage", async () => {
    const release = pendingResponse(fetchMock, () => json(200, { message: "Senha redefinida. Entre com a nova senha." }));
    const { queryClient, unmount } = renderWithProviders(<ResetPasswordForm token={TOKEN} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nova senha/), "Nova-senha-muito-segura-1");
    await user.type(screen.getByLabelText(/^Confirme a nova senha/), "Nova-senha-muito-segura-1");
    await user.dblClick(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByRole("heading", { name: "Senha redefinida" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(window.location.href).not.toContain(TOKEN);
    await expectTokenNotKept(queryClient, TOKEN);
    unmount();
    await expectTokenNotKept(queryClient, TOKEN, { unmounted: true });
  });
});
