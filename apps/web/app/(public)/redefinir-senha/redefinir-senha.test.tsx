import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
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
    const { container } = render(<ResetPasswordForm token={TOKEN} />);
    expect(window.location.search).toBe("");
    expect(screen.getByText(/todas as sessões abertas da sua conta serão encerradas/)).toBeTruthy();
    await expectNoA11yViolations(container);

    await fill("nova-senha-muito-segura");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/password-reset/confirm");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ token: TOKEN, password: "nova-senha-muito-segura" });
    expect(await screen.findByRole("heading", { name: "Senha redefinida" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar");
  });

  it("confirmação divergente ou senha curta não envia", async () => {
    render(<ResetPasswordForm token={TOKEN} />);
    await fill("nova-senha-muito-segura", "outra-senha-muito-segura");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Confirme a nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("WEAK_PASSWORD fica ligado ao campo, com foco no resumo", async () => {
    fetchMock.mockResolvedValue(json(400, { statusCode: 400, code: "WEAK_PASSWORD", message: "A senha não atende aos requisitos." }));
    render(<ResetPasswordForm token={TOKEN} />);
    await fill("senha-comum-demais");
    const summary = await screen.findByRole("group", { name: "Não foi possível redefinir" });
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^Nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("TOKEN_INVALID e ausência de token levam ao pedido de novo link", async () => {
    fetchMock.mockResolvedValue(json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." }));
    const { container, unmount } = render(<ResetPasswordForm token={TOKEN} />);
    await fill("nova-senha-muito-segura");
    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir um novo link" }).getAttribute("href")).toBe("/esqueci-senha");
    await expectNoA11yViolations(container);
    unmount();

    render(<ResetPasswordForm token={null} />);
    expect(screen.getByText("O link de redefinição está incompleto.")).toBeTruthy();
  });
});
