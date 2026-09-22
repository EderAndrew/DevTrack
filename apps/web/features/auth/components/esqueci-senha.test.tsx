import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
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
    const { container } = renderWithProviders(<ForgotPasswordForm />);
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
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/E-mail/), "pessoa@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));
    expect((await screen.findByRole("group")).textContent).toContain("Tente novamente em 15 minutos.");
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

  it("só com teclado: erro ligado ao campo, foco no resumo e confirmação com foco", async () => {
    fetchMock.mockResolvedValue(reply(202, { message: GENERIC }));
    const { container } = renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();
    const email = screen.getByLabelText(/E-mail/);
    const button = screen.getByRole("button", { name: "Enviar link" });
    await expectTabOrder(user, [email, button]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível enviar" }));
    expectFieldErrorLinked(email);
    await expectNoA11yViolations(container);

    await tabTo(user, email);
    await user.keyboard("pessoa@example.test{Enter}");
    const done = await screen.findByText(GENERIC);
    expect(document.activeElement).toBe(done.closest('[role="status"]'));
  });
});

describe("002/US4-3 envio duplicado", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dois cliques seguidos em Enviar link fazem uma só requisição", async () => {
    const release = pendingResponse(fetchMock, () => json(202, { message: GENERIC }));
    renderWithProviders(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "pessoa@example.test");
    await user.dblClick(screen.getByRole("button", { name: "Enviar link" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText(GENERIC)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
