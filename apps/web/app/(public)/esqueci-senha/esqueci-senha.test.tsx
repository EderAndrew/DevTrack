import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { ForgotPasswordForm } from "./forgot-password-form";

const GENERIC = "Se o e-mail puder ser usado, enviaremos as instruções para ele.";
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("ForgotPasswordForm (US8-1, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envia só {email} e mostra a mensagem genérica com foco", async () => {
    fetchMock.mockResolvedValue(json(202, { message: GENERIC }));
    const { container } = render(<ForgotPasswordForm />);
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "pessoa@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/password-reset/request");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ email: "pessoa@example.test" });
    const status = await screen.findByText(GENERIC);
    expect(document.activeElement).toBe(status.closest("[role=status]"));
  });

  it("e-mail vazio não envia; 429 informa a espera", async () => {
    fetchMock.mockResolvedValue(json(429, { statusCode: 429, code: "RATE_LIMITED", message: "Muitas tentativas." }, { "Retry-After": "900" }));
    render(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/E-mail/), "pessoa@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect((await screen.findByRole("group")).textContent).toContain("Tente novamente em 15 minutos.");
  });
});
