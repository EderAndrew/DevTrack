import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAccountView } from "../../../lib/admin-api";
import { expectNoA11yViolations } from "../../../test/a11y";
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
    const { container } = render(<UsersAdmin initialPage={{ items: [ME, ANA], nextCursor: null }} currentUserId={ME.id} />);
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
    render(<UsersAdmin initialPage={{ items: [ME], nextCursor: null }} currentUserId={ME.id} />);
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
        json(409, { statusCode: 409, code: "LAST_ADMIN_PROTECTED", message: "O último administrador ativo não pode ser removido." }),
      );
    const other = account("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Outro Admin", { roles: [{ key: "ADMIN", status: "ACTIVE" }] });
    render(<UsersAdmin initialPage={{ items: [ANA, other], nextCursor: null }} currentUserId={ME.id} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Suspender conta de Ana Aluna" }));
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/users/${ANA.id}/suspend`);
    expect(await screen.findByRole("button", { name: "Reativar conta de Ana Aluna" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Suspender conta de Outro Admin" }));
    expect((await screen.findByRole("group")).textContent).toContain("O último administrador ativo");
  });
});
