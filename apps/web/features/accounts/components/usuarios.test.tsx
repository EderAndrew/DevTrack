import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountPage, UserAccountView } from "@repo/contracts";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { UsersAdmin } from "./users-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const account = (id: string, name: string, overrides: Partial<UserAccountView> = {}): UserAccountView => ({
  id,
  name,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.test`,
  emailVerified: true,
  status: "ACTIVE",
  roles: [{ key: "STUDENT", status: "ACTIVE" }],
  createdAt: "2026-09-21T12:00:00.000Z",
  ...overrides,
});

const ME = account("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Admin", { roles: [{ key: "ADMIN", status: "ACTIVE" }] });
const ANA = account("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Ana Aluna");

describe("UsersAdmin (FR-056, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista contas, não oferece suspender a própria e não tem violações", async () => {
    const { container } = renderWithProviders(<UsersAdmin initialPage={{ items: [ME, ANA], nextCursor: null }} currentUserId={ME.id} />);
    expect(screen.getByText("Sua conta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suspender conta de Ana Aluna" })).toBeTruthy();
    expect(screen.getByText("Administrador (Ativo)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("busca e carrega mais com o cursor", async () => {
    const bea = account("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Bea Aluna");
    fetchMock
      .mockResolvedValueOnce(json(200, { items: [ANA], nextCursor: "c1" }))
      .mockResolvedValueOnce(json(200, { items: [bea], nextCursor: null }));
    renderWithProviders(<UsersAdmin initialPage={{ items: [ME], nextCursor: null }} currentUserId={ME.id} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Buscar por nome ou e-mail"), "aluna");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/users?query=aluna");
    expect(await screen.findByText("Ana Aluna")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/users?query=aluna&cursor=c1");
    expect(await screen.findByText("Bea Aluna")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("suspende e mostra LAST_ADMIN_PROTECTED no resumo", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ...ANA, status: "SUSPENDED" }))
      .mockResolvedValueOnce(
        json(409, { statusCode: 409, code: "LAST_ADMIN_PROTECTED", message: "Não é possível remover o último administrador ativo." }),
      );
    const other = account("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Outro Admin", { roles: [{ key: "ADMIN", status: "ACTIVE" }] });
    renderWithProviders(<UsersAdmin initialPage={{ items: [ANA, other], nextCursor: null }} currentUserId={ME.id} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Suspender conta de Ana Aluna" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/users/${ANA.id}/suspend`);
    expect(await screen.findByRole("button", { name: "Reativar conta de Ana Aluna" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Suspender conta de Outro Admin" }));
    expect((await screen.findByRole("group")).textContent).toContain("Não é possível remover o último administrador ativo.");
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

  it("busca e suspensão só com teclado; falha com foco no resumo", async () => {
    const { container } = renderWithProviders(<UsersAdmin initialPage={{ items: [ME, ANA], nextCursor: null }} currentUserId={ME.id} />);
    const user = userEvent.setup();
    const busca = screen.getByLabelText("Buscar por nome ou e-mail");
    await expectTabOrder(user, [
      busca,
      screen.getByRole("button", { name: "Buscar" }),
      screen.getByRole("button", { name: "Suspender conta de Ana Aluna" }),
    ]);

    fetchMock.mockResolvedValueOnce(reply(200, { items: [ME, ANA], nextCursor: null }));
    await tabTo(user, busca);
    await user.keyboard("ana{Enter}");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]![0])).toContain("query=ana");

    fetchMock.mockResolvedValueOnce(apiError(409, "INVALID_STATE_TRANSITION", "Transição de estado inválida."));
    await tabTo(user, await screen.findByRole("button", { name: "Suspender conta de Ana Aluna" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("group", { name: "Não foi possível concluir" })).toBe(document.activeElement);
    await expectNoA11yViolations(container);

    fetchMock.mockResolvedValueOnce(reply(200, { ...ANA, status: "SUSPENDED" }));
    await tabTo(user, screen.getByRole("button", { name: "Suspender conta de Ana Aluna" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("button", { name: "Reativar conta de Ana Aluna" })).toBeTruthy();
  });
});

describe("002/US4-2 suspender atualiza a linha sem recarregar (FR-023)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a linha mostra Suspenso, o cache da página é atualizado e nada é recarregado", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ...ANA, status: "SUSPENDED" }));
    const { queryClient } = renderWithProviders(
      <UsersAdmin initialPage={{ items: [ME, ANA], nextCursor: null }} currentUserId={ME.id} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Suspender conta de Ana Aluna" }));

    const button = await screen.findByRole("button", { name: "Reativar conta de Ana Aluna" });
    expect(within(button.closest("tr")!).getByText("Suspenso")).toBeTruthy();
    const page = queryClient.getQueryData<AccountPage>(["accounts", "list", "", null]);
    expect(page?.items.find((item) => item.id === ANA.id)?.status).toBe("SUSPENDED");
    expect(queryClient.getQueryData<UserAccountView>(["accounts", "detail", ANA.id])?.status).toBe("SUSPENDED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
