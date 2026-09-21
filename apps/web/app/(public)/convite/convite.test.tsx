import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { INVITATION_TOKEN_KEY, InvitationAcceptance } from "./invitation-acceptance";

const TOKEN = "i".repeat(43);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const preview = (mode: string) =>
  json(200, { role: "MANAGER", email: "gestora@example.test", displayName: "Gestora Bia", mode });

describe("InvitationAcceptance (US4-2, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
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

  it("SIGN_IN_REQUIRED: link sem token e aceite só com {token}", async () => {
    fetchMock.mockResolvedValueOnce(preview("SIGN_IN_REQUIRED")).mockResolvedValueOnce(
      json(403, { statusCode: 403, code: "WRONG_ACCOUNT", message: "Você está conectado em outra conta." }),
    );
    const { container } = render(<InvitationAcceptance token={TOKEN} />);
    const link = await screen.findByRole("link", { name: "Entrar para aceitar" });
    expect(link.getAttribute("href")).toBe("/entrar?next=%2Fconvite");
    expect(window.sessionStorage.getItem(INVITATION_TOKEN_KEY)).toBe(TOKEN);
    await expectNoA11yViolations(container);

    await userEvent.setup().click(screen.getByRole("button", { name: "Aceitar convite" }));
    expect(bodyOf(1)).toEqual({ token: TOKEN });
    expect((await screen.findByRole("group")).textContent).toContain("Você está conectado em outra conta.");
  });

  it("TOKEN_INVALID mostra orientação genérica", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { statusCode: 400, code: "TOKEN_INVALID", message: "Link inválido ou expirado." }));
    const { container } = render(<InvitationAcceptance token={TOKEN} />);
    expect(await screen.findByText("Link inválido ou expirado.")).toBeTruthy();
    expect(screen.getByText(/Peça um novo convite/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
