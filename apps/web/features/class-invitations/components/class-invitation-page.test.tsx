import type { ClassInvitationPreview } from "@repo/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { expectTokenNotKept } from "../../../test/tokens";
import { ClassInvitationPage, loginBackTo } from "./class-invitation-page";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const TOKEN = "t".repeat(43);
const PASSWORD = "girassol-azul-de-outono";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const PREVIEW: ClassInvitationPreview = {
  class: { name: "Algoritmos", code: "ALG-1", academicYear: 2026, period: "1º semestre" },
  teacherName: "Professora Ada",
  email: "aluna.nova@example.test",
  mode: "CREATE_ACCOUNT",
  raRequired: true,
};
const ACCEPTED = { classId: "55555555-5555-4555-8555-555555555555", mode: "CREATE_ACCOUNT", alreadyEnrolled: false };

describe("003/US3-1 003/US3-2 003/US3-4 003/US3-5 ClassInvitationPage — aluno novo (FR-030–FR-036)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
    window.history.replaceState(null, "", `/convite-turma?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as unknown;
  const fill = async (user: ReturnType<typeof userEvent.setup>, confirmation = PASSWORD) => {
    await user.type(screen.getByLabelText(/^Nome completo/), "Aluna Nova");
    await user.type(screen.getByLabelText(/^RA/), "RA-2026.001");
    await user.type(screen.getByLabelText(/^Senha/), PASSWORD);
    await user.type(screen.getByLabelText(/^Confirmar senha/), confirmation);
  };

  it("mostra turma, professor e e-mail só leitura; conclui, mostra \"Você agora faz parte da turma.\" e leva a Minhas turmas (FR-038); 022/US2-1 recarrega o layout raiz com a sessão nova", async () => {
    fetchMock.mockResolvedValueOnce(json(200, PREVIEW)).mockResolvedValueOnce(json(200, ACCEPTED));
    const { container, queryClient } = renderWithProviders(<ClassInvitationPage token={TOKEN} />);

    expect(await screen.findByText("Algoritmos")).toBeTruthy();
    expect(screen.getByText(/Professora Ada/)).toBeTruthy();
    expect(screen.getByText(/ALG-1/)).toBeTruthy();
    const email = screen.getByLabelText(/^E-mail/) as HTMLInputElement;
    expect(email.value).toBe(PREVIEW.email);
    expect(email.readOnly).toBe(true);
    // The token leaves the address bar as soon as the page reads it.
    expect(window.location.search).toBe("");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/class-invitations/preview");
    expect(bodyOf(0)).toEqual({ token: TOKEN });
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));

    expect(await screen.findByText("Você agora faz parte da turma.")).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith("/minhas-turmas?bem-vindo=1");
    expect(router.refresh.mock.invocationCallOrder[0]).toBeGreaterThan(router.replace.mock.invocationCallOrder[0]!);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/class-invitations/accept");
    expect(bodyOf(1)).toEqual({ token: TOKEN, name: "Aluna Nova", ra: "RA-2026.001", password: PASSWORD });
    await expectTokenNotKept(queryClient, TOKEN);
    await expectNoA11yViolations(container);
  });

  it("confirmação diferente e campos vazios: erros junto aos campos, sem chamar o aceite", async () => {
    fetchMock.mockResolvedValueOnce(json(200, PREVIEW));
    const { container } = renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    await screen.findByText("Algoritmos");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível concluir o cadastro" });
    expect(summary.textContent).toContain("Informe seu nome completo.");
    expect(summary.textContent).toContain("Informe o RA.");
    for (const label of [/^Nome completo/, /^RA/, /^Senha/]) expectFieldErrorLinked(screen.getByLabelText(label));

    await fill(user, "outra-senha-qualquer");
    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));
    await waitFor(() => expect(summary.textContent).toContain("As senhas não conferem."));
    expectFieldErrorLinked(screen.getByLabelText(/^Confirmar senha/));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it.each([
    ["RA_TAKEN", 409, "Este RA já está em uso.", /^RA/],
    ["WEAK_PASSWORD", 400, "A senha deve ter entre 12 e 128 caracteres", /^Senha/],
  ])("%s aparece junto ao campo", async (code, status, text, label) => {
    fetchMock.mockResolvedValueOnce(json(200, PREVIEW)).mockResolvedValueOnce(apiError(status, code, "Mensagem da API."));
    renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    await screen.findByText("Algoritmos");
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));

    const field = screen.getByLabelText(label);
    await waitFor(() => expectFieldErrorLinked(field));
    expect(document.getElementById(field.getAttribute("aria-describedby")!.split(" ").find((id) => id.endsWith("-erro"))!)!.textContent).toContain(text);
    expect(screen.queryByText("Você agora faz parte da turma.")).toBeNull();
  });

  it.each([
    ["TOKEN_EXPIRED", "Este convite expirou."],
    ["TOKEN_INVALID", "Este convite não é mais válido."],
  ])("preview %s → \"%s\", sem formulário", async (code, text) => {
    fetchMock.mockResolvedValueOnce(apiError(400, code, "Mensagem da API."));
    const { container } = renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Entrar na turma" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("aceite recusado com TOKEN_INVALID troca o formulário pelo aviso", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, PREVIEW))
      .mockResolvedValueOnce(apiError(400, "TOKEN_INVALID", "Mensagem da API."));
    renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    await screen.findByText("Algoritmos");
    const user = userEvent.setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));
    expect(await screen.findByText("Este convite não é mais válido.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Entrar na turma" })).toBeNull();
  });

  it("sem token no link não chama a API", async () => {
    window.history.replaceState(null, "", "/convite-turma");
    renderWithProviders(<ClassInvitationPage token={null} />);
    expect(await screen.findByText("Este convite não é mais válido.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("003/SC-011 SC-012 — ClassInvitationPage só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação e envio com Enter", async () => {
    fetchMock.mockResolvedValueOnce(json(200, PREVIEW)).mockResolvedValueOnce(json(200, ACCEPTED));
    renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    await screen.findByText("Algoritmos");
    const user = userEvent.setup();
    const name = screen.getByLabelText(/^Nome completo/);

    await expectTabOrder(user, [
      screen.getByLabelText(/^E-mail/),
      name,
      screen.getByLabelText(/^RA/),
      screen.getByLabelText(/^Senha/),
      screen.getByLabelText(/^Confirmar senha/),
      screen.getByRole("button", { name: "Entrar na turma" }),
    ]);

    await tabTo(user, name);
    await user.keyboard(`Aluna Nova{Tab}RA-1{Tab}${PASSWORD}{Tab}${PASSWORD}{Enter}`);
    expect(await screen.findByText("Você agora faz parte da turma.")).toBeTruthy();
  });
});

describe("003/US4-1 003/US4-2 003/US4-3 003/US4-5 003/US4-6 ClassInvitationPage — conta existente (FR-032–FR-036)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const EMAIL = PREVIEW.email;

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", `/convite-turma?token=${TOKEN}`);
  });
  afterEach(() => vi.unstubAllGlobals());

  const bodyOf = (call: number) => JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as unknown;
  const preview = (overrides: Partial<ClassInvitationPreview>) => json(200, { ...PREVIEW, ...overrides });

  it("SIGN_IN_REQUIRED sem sessão: \"Entrar para aceitar\" volta ao convite pelo login, sem pedir senha", async () => {
    fetchMock.mockResolvedValueOnce(preview({ mode: "SIGN_IN_REQUIRED", raRequired: false }));
    const { container } = renderWithProviders(<ClassInvitationPage token={TOKEN} />);

    const link = await screen.findByRole("link", { name: "Entrar para aceitar" });
    expect(link.getAttribute("href")).toBe(loginBackTo(TOKEN));
    expect(link.getAttribute("href")).toBe(`/entrar?next=${encodeURIComponent(`/convite-turma?token=${TOKEN}`)}`);
    expect(screen.queryByLabelText(/^Senha/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it("SIGN_IN_REQUIRED com a conta convidada e RA faltando: pede só o RA e aceita", async () => {
    fetchMock.mockResolvedValueOnce(preview({ mode: "SIGN_IN_REQUIRED", raRequired: true })).mockResolvedValueOnce(
      json(200, { ...ACCEPTED, mode: "SIGN_IN_REQUIRED" }),
    );
    const { container } = renderWithProviders(
      <ClassInvitationPage token={TOKEN} signedInAs={{ name: "Aluna", email: EMAIL.toUpperCase() }} />,
    );
    const user = userEvent.setup();
    const button = await screen.findByRole("button", { name: "Aceitar convite" });
    expect(screen.queryByLabelText(/^Senha/)).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(button);
    const summary = await screen.findByRole("group", { name: "Não foi possível aceitar o convite" });
    expect(summary.textContent).toContain("Informe o RA.");
    expectFieldErrorLinked(screen.getByLabelText(/^RA/));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText(/^RA/), "RA-77");
    await user.click(button);
    expect(await screen.findByText("Você agora faz parte da turma.")).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith("/minhas-turmas?bem-vindo=1");
    expect(bodyOf(1)).toEqual({ token: TOKEN, ra: "RA-77" });
  });

  it("SIGN_IN_REQUIRED com RA no perfil: só o botão; já matriculado → \"Você já faz parte desta turma.\"", async () => {
    fetchMock.mockResolvedValueOnce(preview({ mode: "SIGN_IN_REQUIRED", raRequired: false })).mockResolvedValueOnce(
      json(200, { ...ACCEPTED, mode: "SIGN_IN_REQUIRED", alreadyEnrolled: true }),
    );
    renderWithProviders(<ClassInvitationPage token={TOKEN} signedInAs={{ name: "Aluna", email: EMAIL }} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Aceitar convite" }));
    expect(await screen.findByText("Você já faz parte desta turma.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver minhas turmas" }).getAttribute("href")).toBe("/minhas-turmas");
    expect(router.replace).not.toHaveBeenCalled();
    expect(bodyOf(1)).toEqual({ token: TOKEN });
    expect(screen.queryByLabelText(/^RA/)).toBeNull();
  });

  it("003/US4-3 outra conta: orientação de sair, sem aceitar; sair leva ao login de volta ao convite", async () => {
    fetchMock
      .mockResolvedValueOnce(preview({ mode: "SIGN_IN_REQUIRED", raRequired: false }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { container } = renderWithProviders(
      <ClassInvitationPage token={TOKEN} signedInAs={{ name: "Outra", email: "outra@example.test" }} />,
    );
    expect(
      await screen.findByText("Este convite é para outra conta. Saia e entre com o e-mail convidado."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aceitar convite" })).toBeNull();
    await expectNoA11yViolations(container);

    await userEvent.setup().click(screen.getByRole("button", { name: "Sair e entrar com outra conta" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(loginBackTo(TOKEN)));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/logout");
  });

  it("WRONG_ACCOUNT vindo da API também mostra a orientação de sair", async () => {
    fetchMock
      .mockResolvedValueOnce(preview({ mode: "SIGN_IN_REQUIRED", raRequired: false }))
      .mockResolvedValueOnce(apiError(403, "WRONG_ACCOUNT", "Mensagem da API."));
    renderWithProviders(<ClassInvitationPage token={TOKEN} signedInAs={{ name: "Aluna", email: EMAIL }} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Aceitar convite" }));
    expect(
      await screen.findByText("Este convite é para outra conta. Saia e entre com o e-mail convidado."),
    ).toBeTruthy();
  });

  it("003/US4-6 CLAIM_ACCOUNT com RA no perfil: aviso, nome e senha (sem RA) e envio sem RA", async () => {
    fetchMock.mockResolvedValueOnce(preview({ mode: "CLAIM_ACCOUNT", raRequired: false })).mockResolvedValueOnce(
      json(200, { ...ACCEPTED, mode: "CLAIM_ACCOUNT" }),
    );
    const { container } = renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    expect(await screen.findByText(/cadastro não confirmado/)).toBeTruthy();
    expect(screen.queryByLabelText(/^RA/)).toBeNull();
    await expectNoA11yViolations(container);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome completo/), "Dona do E-mail");
    await user.type(screen.getByLabelText(/^Senha/), PASSWORD);
    await user.type(screen.getByLabelText(/^Confirmar senha/), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Entrar na turma" }));
    expect(await screen.findByText("Você agora faz parte da turma.")).toBeTruthy();
    expect(bodyOf(1)).toEqual({ token: TOKEN, name: "Dona do E-mail", password: PASSWORD });
  });

  it("CLAIM_ACCOUNT sem RA no perfil pede o RA", async () => {
    fetchMock.mockResolvedValueOnce(preview({ mode: "CLAIM_ACCOUNT", raRequired: true }));
    renderWithProviders(<ClassInvitationPage token={TOKEN} />);
    expect(await screen.findByLabelText(/^RA/)).toBeTruthy();
  });
});
