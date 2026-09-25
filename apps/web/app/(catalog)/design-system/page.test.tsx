import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { GROUPS } from "@/features/design-system/registry";
import { renderWithProviders } from "../../../test/render";
import DesignSystemPage from "./page";

// 005 US4-4 (FR-031; contracts/layouts.md "Catálogo"; research V14).

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/design-system",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

describe("005/US4-4 o catálogo não existe em produção", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("em produção a página chama notFound()", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DesignSystemPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("em desenvolvimento mostra o índice por grupo, com âncoras para as seções", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderWithProviders(<Toaster>{DesignSystemPage()}</Toaster>);
    expect(screen.getByRole("heading", { level: 1, name: "Design System" })).toBeTruthy();
    const index = screen.getByRole("navigation", { name: "Índice do catálogo" });
    for (const group of GROUPS) {
      const link = within(index).getByRole("link", { name: group.name });
      expect(link.getAttribute("href")).toBe(`#${group.id}`);
      expect(document.getElementById(group.id)?.querySelector("h2")?.textContent).toBe(group.name);
    }
  });
});
