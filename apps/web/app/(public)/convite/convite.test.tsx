import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { INVITATION_TOKEN_KEY, InvitationAcceptance } from "./invitation-acceptance";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const TOKEN = "i".repeat(43);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const preview = (mode: string) =>
  json(200, { role: "MANAGER", email: "gestora@example.test", displayName: "Gestora Bia", mode });

describe("InvitationAcceptance (US4-2, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/convite?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]?.body)) as unknown;

  it("CREATE_ACCOUNT: mostra papel e nome do convite e envia {token, password}", async () => {
    fetchMock.mockResolvedValueOnce(preview("CREATE_ACCOUNT")).mockResolvedValueOnce(json(200, { role: "MANAGER", mode: "CREATE_ACCOUNT" }));
    const { container } = render(<InvitationAcceptance token={TOKEN} />);

    expect(await screen.findByText(/Gestora Bia, você foi convidado/)).toBeTruthy();
    expect(screen.getByText("Gestor de cadastros")).toBeTruthy();
    expect(window.location.search).toBe("");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/invitations/preview");
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nova senha/), "senha-forte-da-gestora");
    await user.click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(await screen.findByRole("heading", { name: "Convite aceito" })).toBeTruthy();
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/invitations/accept");
    expect(bodyOf(1)).toEqual({ token: TOKEN, password: "senha-forte-da-gestora" });
    expect(window.sessionStorage.getItem(INVITATION_TOKEN_KEY)).toBeNull();
  });

  it("SIGN_IN_REQUIRED sem sessão: só o link para entrar, sem token na URL", async () => {
    fetchMock.mockResolvedValueOnce(preview("SIGN_IN_REQUIRED"));
    const { container } = render(<InvitationAcceptance token={TOKEN} signedInAs={null} />);
    const link = await screen.findByRole("link", { name: "Entrar para aceitar" });
    expect(link.getAttribute("href")).toBe("/entrar?next=%2Fconvite");
    expect(screen.queryByRole("button", { name: "Aceitar convite" })).toBeNull();
    expect(window.sessionStorage.getItem(INVITATION_TOKEN_KEY)).toBe(TOKEN);
    await expectNoA11yViolations(container);
  });

  it("SIGN_IN_REQUIRED com a conta do convite: aceita enviando só {token}", async () => {
    fetchMock
      .mockResolvedValueOnce(preview("SIGN_IN_REQUIRED"))
      .mockResolvedValueOnce(json(200, { role: "TEACHER", mode: "SIGN_IN_REQUIRED" }));
    const { container } = render(
      <InvitationAcceptance token={TOKEN} signedInAs={{ name: "Bia", email: "GESTORA@example.test" }} />,
    );
    expect(await screen.findByText(/Você está conectado como/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Entrar para aceitar" })).toBeNull();
    await expectNoA11yViolations(container);

    await userEvent.setup().click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(bodyOf(1)).toEqual({ token: TOKEN });
    expect(await screen.findByText(/Boas-vindas! Você agora tem o papel de Professor/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o início" })).toBeTruthy();
  });

  it("SIGN_IN_REQUIRED com outra conta: sem botão de aceite, oferece trocar de conta", async () => {
    fetchMock.mockResolvedValueOnce(preview("SIGN_IN_REQUIRED")).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { container } = render(
      <InvitationAcceptance token={TOKEN} signedInAs={{ name: "Outro", email: "outro@example.test" }} />,
    );
    expect(await screen.findByText(/é preciso entrar com a conta gestora@example.test/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar convite" })).toBeNull();
    await expectNoA11yViolations(container);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sair e entrar com outra conta" }));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/logout");
    expect(router.replace).toHaveBeenCalledWith("/entrar?next=%2Fconvite");
    expect(window.sessionStorage.getItem(INVITATION_TOKEN_KEY)).toBe(TOKEN);
  });

  it("CLAIM_ACCOUNT avisa que a senha anterior e as sessões deixam de valer", async () => {
    fetchMock.mockResolvedValueOnce(preview("CLAIM_ACCOUNT"));
    const { container } = render(<InvitationAcceptance token={TOKEN} />);
    expect(await screen.findByText(/a senha anterior deixa de funcionar e todas as sessões/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("TOKEN_INVALID mostra orientação genérica", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." }));
    const { container } = render(<InvitationAcceptance token={TOKEN} />);
    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    expect(screen.getByText(/Peça um novo convite/)).toBeTruthy();
    await expectNoA11yViolations(container);
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

  const invitationPreview = (mode: string) =>
    reply(200, { role: "TEACHER", email: "prof@example.test", displayName: "Prof Caio", mode });

  it("definir senha só com teclado: erro ligado ao campo, foco no resumo e aceite", async () => {
    fetchMock
      .mockResolvedValueOnce(invitationPreview("CREATE_ACCOUNT"))
      .mockResolvedValueOnce(reply(200, { role: "TEACHER", mode: "CREATE_ACCOUNT" }));
    const { container } = render(<InvitationAcceptance token={TOKEN} />);
    const user = userEvent.setup();
    const senha = await screen.findByLabelText(/Nova senha/);
    const button = screen.getByRole("button", { name: "Aceitar convite" });
    await expectTabOrder(user, [senha, button]);

    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Não foi possível aceitar" }));
    expectFieldErrorLinked(senha);
    await expectNoA11yViolations(container);

    await tabTo(user, senha);
    await user.keyboard("senha-forte-do-docente{Enter}");
    expect(await screen.findByRole("heading", { name: "Convite aceito" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("conta existente, já conectada: aceita só com teclado", async () => {
    fetchMock
      .mockResolvedValueOnce(invitationPreview("SIGN_IN_REQUIRED"))
      .mockResolvedValueOnce(reply(200, { role: "TEACHER", mode: "EXISTING_ACCOUNT" }));
    render(<InvitationAcceptance token={TOKEN} signedInAs={{ name: "Prof Caio", email: "prof@example.test" }} />);
    const user = userEvent.setup();
    await tabTo(user, await screen.findByRole("button", { name: "Aceitar convite" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Convite aceito" })).toBeTruthy();
  });
});
