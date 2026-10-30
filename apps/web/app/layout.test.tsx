import type { MeView } from "@repo/contracts";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 022 research Z4: the root layout renders the account's theme on <html> from the server's `GET /me`.
const getMeForNavigation = vi.fn<() => Promise<MeView | null>>();
vi.mock("@/features/auth/api/server", () => ({ getMeForNavigation: () => getMeForNavigation() }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "fonte" }) }));
vi.mock("./providers", () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("./globals.css", () => ({}));

const { default: RootLayout } = await import("./layout");

const me = (theme: MeView["theme"]): MeView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ana Souza",
  email: "ana@example.test",
  emailVerified: true,
  roles: [{ key: "STUDENT", status: "ACTIVE" }],
  permissions: [],
  theme,
});

const themeOf = async () => {
  const html = (await RootLayout({ children: <p>conteúdo</p> })) as ReactElement<Record<string, unknown>>;
  expect(html.type).toBe("html");
  return html.props["data-theme"];
};

describe("022/US1 tema no layout raiz", () => {
  beforeEach(() => getMeForNavigation.mockReset());

  it("022/US1-3 022/FR-008 conta com LIGHT → <html data-theme=\"light\">", async () => {
    getMeForNavigation.mockResolvedValue(me("LIGHT"));
    expect(await themeOf()).toBe("light");
  });

  it("022/FR-008 conta com DARK → <html data-theme=\"dark\">", async () => {
    getMeForNavigation.mockResolvedValue(me("DARK"));
    expect(await themeOf()).toBe("dark");
  });

  it("022/FR-004 sem sessão ou falha → <html data-theme=\"dark\">", async () => {
    getMeForNavigation.mockResolvedValue(null);
    expect(await themeOf()).toBe("dark");
  });
});
