import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { expectTokenNotKept, pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { VerifyEmail } from "./verify-email";

const TOKEN = "a".repeat(43);
const GENERIC = "Se o e-mail puder ser usado, enviaremos as instruções para ele.";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const invalid = () =>
  json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." });

describe("VerifyEmail (US1-4, US1-5, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/verificar-email?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envia o token uma única vez, tira-o da URL e confirma", async () => {
    fetchMock.mockResolvedValue(json(200, { emailVerified: true }));
    const { container } = renderWithProviders(<VerifyEmail token={TOKEN} />);

    expect(await screen.findByRole("heading", { name: "E-mail verificado" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/verify-email");
    expect(JSON.parse(String(init?.body))).toEqual({ token: TOKEN });
    expect(window.location.search).toBe("");
    expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar");
    await expectNoA11yViolations(container);
  });

  it("TOKEN_INVALID oferece reenvio, que envia só o e-mail e mostra a mensagem genérica", async () => {
    fetchMock.mockResolvedValueOnce(invalid()).mockResolvedValueOnce(json(202, { message: GENERIC }));
    const { container } = renderWithProviders(<VerifyEmail token={TOKEN} />);

    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "aluna@example.test");
    await user.click(screen.getByRole("button", { name: "Enviar novo link" }));

    expect(await screen.findByText(GENERIC)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/auth/verify-email/resend");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "aluna@example.test" });
  });

  it("sem token não chama a API e oferece reenvio", async () => {
    renderWithProviders(<VerifyEmail token={null} />);
    expect(screen.getByRole("heading", { name: "Não foi possível verificar" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("reenvio só com teclado: erro ligado ao campo, foco no resumo e envio", async () => {
    fetchMock.mockResolvedValue(reply(202, { message: GENERIC }));
    const { container } = renderWithProviders(<VerifyEmail token={null} />);
    const user = userEvent.setup();
    const email = screen.getByLabelText(/E-mail/);
    const button = screen.getByRole("button", { name: "Enviar novo link" });
    await expectTabOrder(user, [email, button]);
    await expectNoA11yViolations(container);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Corrija os itens abaixo" }));
    expectFieldErrorLinked(email);
    await expectNoA11yViolations(container);

    await tabTo(user, email);
    await user.keyboard("aluna@example.test{Enter}");
    expect(await screen.findByText(GENERIC)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("002/US4-3 e 002/FR-027 envio duplicado e token", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/verificar-email?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("após verificar, o token não fica na URL, em cache nem em storage", async () => {
    fetchMock.mockResolvedValue(json(200, { emailVerified: true }));
    const { queryClient, unmount } = renderWithProviders(<VerifyEmail token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "E-mail verificado" })).toBeTruthy();
    expect(window.location.href).not.toContain(TOKEN);
    await expectTokenNotKept(queryClient, TOKEN);
    unmount();
    await expectTokenNotKept(queryClient, TOKEN, { unmounted: true });
  });

  it("dois cliques seguidos em Enviar novo link fazem uma só requisição", async () => {
    const release = pendingResponse(fetchMock, () => json(202, { message: GENERIC }));
    renderWithProviders(<VerifyEmail token={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "aluna@example.test");
    await user.dblClick(screen.getByRole("button", { name: "Enviar novo link" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText(GENERIC)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
