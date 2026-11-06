import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClassInvitationRoute from "@/app/(auth)/convite-turma/page";
import InvitationPage from "@/app/(auth)/convite/page";
import { renderWithProviders } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/auth/api/server", () => ({ getMe: () => Promise.resolve(null) }));

describe("telas de convite: nome do produto centralizado acima do título", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["/convite", InvitationPage, "Aceitar convite"],
    ["/convite-turma", ClassInvitationRoute, "Convite para turma"],
  ])("%s", async (_path, Page, title) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(() => new Promise(() => undefined)));
    renderWithProviders(await Page({ searchParams: Promise.resolve({}) }));

    const heading = screen.getByRole("heading", { level: 1, name: title });
    const wordmark = screen.getByText("Dev").parentElement!;
    expect(wordmark.textContent).toBe("DevTrack");
    expect(wordmark.closest("p")!.className).toContain("text-center");
    expect(wordmark.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
