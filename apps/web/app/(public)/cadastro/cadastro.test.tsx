import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { SignupForm } from "./signup-form";

const GENERIC = "Se o e-mail puder ser usado, enviaremos as instruções para ele.";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("SignupForm (US1, FR-010, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const fill = async (password = "senha-forte-do-aluno") => {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nome/), "Aluna Teste");
    await user.type(screen.getByLabelText(/E-mail/), "aluna@example.test");
    await user.type(screen.getByLabelText(/^Senha/), password);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
  };

  it("não tem violações de acessibilidade", async () => {
    const { container } = render(<SignupForm />);
    await expectNoA11yViolations(container);
  });

  it("envia só nome, e-mail e senha e mostra a mensagem genérica com foco", async () => {
    fetchMock.mockResolvedValue(json(202, { message: GENERIC }));
    render(<SignupForm />);
    await fill();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/signup");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Aluna Teste",
      email: "aluna@example.test",
      password: "senha-forte-do-aluno",
    });

    const status = await screen.findByRole("status", { name: "" });
    expect(status.textContent).toContain(GENERIC);
    expect(document.activeElement).toBe(status);
    expect(screen.queryByRole("button", { name: "Criar conta" })).toBeNull();
  });

  it("senha curta não envia e liga o erro ao campo", async () => {
    const { container } = render(<SignupForm />);
    await fill("curta");

    expect(fetchMock).not.toHaveBeenCalled();
    const password = screen.getByLabelText(/^Senha/);
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-describedby")).toContain("senha-erro");
    expect(document.getElementById("senha-erro")?.textContent).toMatch(/12 a 128/);
    await expectNoA11yViolations(container);
  });

  it("WEAK_PASSWORD da API aparece no resumo com foco", async () => {
    fetchMock.mockResolvedValue(
      json(400, { statusCode: 400, code: "WEAK_PASSWORD", message: "A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum." }),
    );
    render(<SignupForm />);
    await fill();

    const summary = await screen.findByRole("group", { name: "Corrija os itens abaixo" });
    expect(summary.textContent).toContain("A senha deve ter entre 12 e 128 caracteres e não pode ser uma senha comum.");
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText(/^Senha/).getAttribute("aria-invalid")).toBe("true");
  });

  it("RATE_LIMITED informa quando tentar de novo", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 429, code: "RATE_LIMITED", message: "Muitas tentativas." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "600" },
      }),
    );
    render(<SignupForm />);
    await fill();
    expect((await screen.findByRole("group")).textContent).toContain("Tente novamente em 10 minutos.");
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

  it("só com teclado: ordem dos campos, erros ligados, foco no resumo e envio", async () => {
    fetchMock.mockResolvedValue(reply(202, { message: GENERIC }));
    const { container } = render(<SignupForm />);
    const user = userEvent.setup();
    const [nome, email, senha] = [/Nome/, /E-mail/, /^Senha/].map((name) => screen.getByLabelText(name));
    const button = screen.getByRole("button", { name: "Criar conta" });
    await expectTabOrder(user, [nome!, email!, senha!, button]);
    await expectNoA11yViolations(container);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Corrija os itens abaixo" }));
    for (const field of [nome!, email!, senha!]) expectFieldErrorLinked(field);
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);

    await tabTo(user, nome!);
    await user.keyboard("Aluna Teste");
    await tabTo(user, email!);
    await user.keyboard("aluna@example.test");
    await tabTo(user, senha!);
    await user.keyboard("senha-forte-do-aluno{Enter}");
    const done = await screen.findByText(GENERIC);
    expect(document.activeElement).toBe(done.closest('[role="status"]'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
