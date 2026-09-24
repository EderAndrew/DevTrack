import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNextPath, startPathFor } from "../../../lib/navigation";
import { expectNoA11yViolations } from "../../../test/a11y";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { pendingResponse } from "../../../test/tokens";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { LoginForm } from "./login-form";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("LoginForm (US2, FR-021, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const submit = async (email = "aluna@example.test", password = "senha-forte-do-aluno") => {
    const user = userEvent.setup();
    if (email) await user.type(screen.getByLabelText(/E-mail/), email);
    if (password) await user.type(screen.getByLabelText(/^Senha/), password);
    await user.click(screen.getByRole("button", { name: "Entrar" }));
  };

  it("não tem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<LoginForm next="/conta/sessoes" />);
    await expectNoA11yViolations(container);
  });

  it("envia só e-mail e senha e vai para o destino", async () => {
    fetchMock.mockResolvedValue(json(200, { user: { id: "u" } }));
    renderWithProviders(<LoginForm next="/conta/sessoes" />);
    await submit();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "aluna@example.test", password: "senha-forte-do-aluno" });
    expect(router.replace).toHaveBeenCalledWith("/conta/sessoes");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("401 mostra a mensagem genérica no resumo, com foco, sem apontar campo", async () => {
    fetchMock.mockResolvedValue(
      json(401, { statusCode: 401, code: "INVALID_CREDENTIALS", message: "E-mail ou senha incorretos." }),
    );
    const { container } = renderWithProviders(<LoginForm next="/conta/sessoes" />);
    await submit();

    const summary = await screen.findByRole("group", { name: "Não foi possível entrar" });
    expect(summary.textContent).toContain("E-mail ou senha incorretos.");
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/E-mail/).hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByLabelText(/^Senha/).hasAttribute("aria-invalid")).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it("429 informa quanto esperar", async () => {
    fetchMock.mockResolvedValue(
      json(429, { statusCode: 429, code: "RATE_LIMITED", message: "Muitas tentativas." }, { "Retry-After": "60" }),
    );
    renderWithProviders(<LoginForm next="/conta/sessoes" />);
    await submit();
    expect((await screen.findByRole("group")).textContent).toContain("Tente novamente em 1 minuto.");
  });

  it("campos vazios não chamam a API", async () => {
    renderWithProviders(<LoginForm next="/conta/sessoes" />);
    await submit("", "");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/E-mail/).getAttribute("aria-invalid")).toBe("true");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/conta/sessoes", "/conta/sessoes"],
    ["/conta/sessoes?x=1", "/conta/sessoes?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("004/FR-001 página inicial depois do login", () => {
  it("professor (disciplinas.visualizar) começa em Minhas disciplinas; os demais no perfil", () => {
    expect(startPathFor(["disciplinas.visualizar", "turmas.visualizar"])).toBe("/disciplinas");
    expect(startPathFor(["turmas_do_aluno.visualizar"])).toBe("/conta/perfil");
    expect(startPathFor([])).toBe("/conta/perfil");
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

  it("só com teclado: ordem, erros ligados, foco no resumo e login", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: { id: "u" } }));
    const { container } = renderWithProviders(<LoginForm next="/conta/sessoes" />);
    const user = userEvent.setup();
    const email = screen.getByLabelText(/E-mail/);
    const senha = screen.getByLabelText(/^Senha/);
    const button = screen.getByRole("button", { name: "Entrar" });
    await expectTabOrder(user, [email, senha, button]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível entrar" }));
    expectFieldErrorLinked(email);
    expectFieldErrorLinked(senha);
    await expectNoA11yViolations(container);

    await tabTo(user, email);
    await user.keyboard("aluna@example.test");
    await tabTo(user, senha);
    await user.keyboard("senha-forte-do-aluno{Enter}");
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/conta/sessoes"));
  });

  it("só com teclado: recusa da API vai para o resumo com foco, sem apontar campo", async () => {
    fetchMock.mockResolvedValue(apiError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos."));
    const { container } = renderWithProviders(<LoginForm next="/conta/sessoes" />);
    const user = userEvent.setup();
    await tabTo(user, screen.getByLabelText(/E-mail/));
    await user.keyboard("aluna@example.test");
    await tabTo(user, screen.getByLabelText(/^Senha/));
    await user.keyboard("senha-errada-mas-longa{Enter}");
    const summary = await screen.findByRole("group", { name: "Não foi possível entrar" });
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/E-mail/).hasAttribute("aria-invalid")).toBe(false);
    await expectNoA11yViolations(container);
  });
});

describe("002/US4-3 envio duplicado", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("dois cliques seguidos em Entrar fazem uma só requisição", async () => {
    const release = pendingResponse(fetchMock, () => json(200, { user: { id: "u" } }));
    renderWithProviders(<LoginForm next="/conta/sessoes" />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "aluna@example.test");
    await user.type(screen.getByLabelText(/^Senha/), "senha-forte-do-aluno");
    await user.dblClick(screen.getByRole("button", { name: "Entrar" }));
    await user.click(screen.getByRole("button", { name: "Entrando…" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/conta/sessoes"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("002/US4-4 outra pessoa entra no mesmo navegador (FR-024)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("login bem-sucedido começa com o cache vazio, antes de navegar", async () => {
    fetchMock.mockResolvedValue(json(200, { user: { id: "u" } }));
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(["sessions", "list"], { items: [{ id: "da-pessoa-anterior" }] });
    let cachedAtNavigation = -1;
    router.replace.mockImplementation(() => {
      cachedAtNavigation = queryClient.getQueryCache().getAll().length;
    });
    renderWithProviders(<LoginForm next="/conta/sessoes" />, { queryClient });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "outra@example.test");
    await user.type(screen.getByLabelText(/^Senha/), "senha-forte-da-outra");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/conta/sessoes"));
    expect(cachedAtNavigation).toBe(0);
  });

  it("login recusado mantém o cache (nada muda de dono)", async () => {
    fetchMock.mockResolvedValue(json(401, { statusCode: 401, code: "INVALID_CREDENTIALS", message: "x" }));
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(["x"], 1);
    renderWithProviders(<LoginForm next="/conta/sessoes" />, { queryClient });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/E-mail/), "outra@example.test");
    await user.type(screen.getByLabelText(/^Senha/), "senha-errada-mas-longa");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("group", { name: "Não foi possível entrar" });
    expect(queryClient.getQueryData(["x"])).toBe(1);
  });
});
