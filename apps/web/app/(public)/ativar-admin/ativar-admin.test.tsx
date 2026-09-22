import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { ACTIVATION_TOKEN_KEY, AdminActivation } from "./admin-activation";

const TOKEN = "t".repeat(43);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const preview = (mode: string) => json(200, { email: "admin@example.test", mode });

describe("AdminActivation (US3, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/ativar-admin?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]?.body)) as unknown;

  it.each(["CREATE_ACCOUNT", "CLAIM_ACCOUNT"])("%s: define a senha e envia só {token, password}", async (mode) => {
    fetchMock.mockResolvedValueOnce(preview(mode)).mockResolvedValueOnce(json(200, { role: "ADMIN" }));
    const { container } = render(<AdminActivation token={TOKEN} />);

    const field = await screen.findByLabelText(/Nova senha/);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem(ACTIVATION_TOKEN_KEY)).toBe(TOKEN);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin-activation/preview");
    expect(bodyOf(0)).toEqual({ token: TOKEN });
    if (mode === "CLAIM_ACCOUNT") expect(screen.getByText(/sessões abertas/)).toBeTruthy();
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.type(field, "senha-forte-do-admin");
    await user.click(screen.getByRole("button", { name: "Ativar administrador" }));

    expect(await screen.findByRole("heading", { name: "Conta de administrador ativada" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/admin-activation");
    expect(bodyOf(1)).toEqual({ token: TOKEN, password: "senha-forte-do-admin" });
    expect(window.sessionStorage.getItem(ACTIVATION_TOKEN_KEY)).toBeNull();
  });

  it("senha curta não envia", async () => {
    fetchMock.mockResolvedValueOnce(preview("CREATE_ACCOUNT"));
    render(<AdminActivation token={TOKEN} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nova senha/), "curta");
    await user.click(screen.getByRole("button", { name: "Ativar administrador" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Nova senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("SIGN_IN_REQUIRED: link para entrar sem o token e conclusão enviando só {token}", async () => {
    fetchMock
      .mockResolvedValueOnce(preview("SIGN_IN_REQUIRED"))
      .mockResolvedValueOnce(json(401, { statusCode: 401, code: "SIGN_IN_REQUIRED", message: "Entre na conta para continuar." }))
      .mockResolvedValueOnce(json(200, { role: "ADMIN" }));
    const { container } = render(<AdminActivation token={TOKEN} />);

    const link = await screen.findByRole("link", { name: "Entrar para concluir" });
    expect(link.getAttribute("href")).toBe("/entrar?next=%2Fativar-admin");
    expect(link.getAttribute("href")).not.toContain(TOKEN);
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Concluir ativação" }));
    expect((await screen.findByRole("group")).textContent).toContain("Entre na conta para continuar.");
    expect(bodyOf(1)).toEqual({ token: TOKEN });

    await user.click(screen.getByRole("button", { name: "Concluir ativação" }));
    expect(await screen.findByRole("heading", { name: "Conta de administrador ativada" })).toBeTruthy();
  });

  it("de volta do login, usa o token guardado no sessionStorage", async () => {
    window.sessionStorage.setItem(ACTIVATION_TOKEN_KEY, TOKEN);
    window.history.replaceState(null, "", "/ativar-admin");
    fetchMock.mockResolvedValueOnce(preview("SIGN_IN_REQUIRED"));
    render(<AdminActivation token={null} />);
    expect(await screen.findByRole("button", { name: "Concluir ativação" })).toBeTruthy();
    expect(bodyOf(0)).toEqual({ token: TOKEN });
  });

  it("TOKEN_INVALID e 409 mostram a orientação e limpam o token", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." }));
    const { container, unmount } = render(<AdminActivation token={TOKEN} />);
    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    expect(window.sessionStorage.getItem(ACTIVATION_TOKEN_KEY)).toBeNull();
    await expectNoA11yViolations(container);
    unmount();

    window.history.replaceState(null, "", `/ativar-admin?token=${TOKEN}`);
    fetchMock
      .mockResolvedValueOnce(preview("CREATE_ACCOUNT"))
      .mockResolvedValueOnce(
        json(409, { statusCode: 409, code: "BOOTSTRAP_ALREADY_DONE", message: "Bootstrap administrativo já realizado." }),
      );
    render(<AdminActivation token={TOKEN} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Nova senha/), "senha-forte-do-admin");
    await user.click(screen.getByRole("button", { name: "Ativar administrador" }));
    expect(await screen.findByText("Bootstrap administrativo já realizado.")).toBeTruthy();
    expect(window.sessionStorage.getItem(ACTIVATION_TOKEN_KEY)).toBeNull();
  });

  it("sem token não chama a API", async () => {
    render(<AdminActivation token={null} />);
    expect(await screen.findByText("O link de ativação está incompleto.")).toBeTruthy();
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

  it("só com teclado: erro ligado ao campo, foco no resumo e ativação", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { email: "admin@example.test", mode: "CREATE_ACCOUNT" }))
      .mockResolvedValueOnce(reply(200, { role: "ADMIN" }));
    const { container } = render(<AdminActivation token={TOKEN} />);
    const user = userEvent.setup();
    const senha = await screen.findByLabelText(/Nova senha/);
    const button = screen.getByRole("button", { name: "Ativar administrador" });
    await expectTabOrder(user, [senha, button]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível ativar" }));
    expectFieldErrorLinked(senha);
    await expectNoA11yViolations(container);

    await tabTo(user, senha);
    await user.keyboard("senha-forte-do-admin{Enter}");
    expect(await screen.findByRole("heading", { name: "Conta de administrador ativada" })).toBeTruthy();
  });
});
