import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { AppearanceSettings } from "./appearance-settings";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fetch that answers only when `release` is called, to look at the screen while it is pending. */
function heldFetch() {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => (release = resolve));
  return { pending, release: (response: Response) => act(async () => release(response)) };
}

const FAILURE = "Não foi possível salvar a aparência. Tente de novo.";

describe("022/US1 Aparência em Meu perfil", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    document.documentElement.dataset.theme = "dark";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  const toggle = () => screen.getByRole("switch", { name: "Tema claro" });

  it("022/US1-1 só o interruptor (nome acessível Tema claro) entre a lua e o sol, sem texto visível, sem violações axe", async () => {
    const { container } = renderWithProviders(<AppearanceSettings theme="LIGHT" />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.textContent?.trim()).toBe("");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    const moon = container.querySelector('[data-theme-icon="dark"]');
    const sun = container.querySelector('[data-theme-icon="light"]');
    expect(moon?.getAttribute("aria-hidden")).toBe("true");
    expect(sun?.getAttribute("aria-hidden")).toBe("true");
    // The moon sits before the switch and the sun after it; the current theme's icon is the strong one.
    expect(moon!.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle().compareDocumentPosition(sun!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sun!.getAttribute("class")).toContain("text-foreground");
    expect(moon!.getAttribute("class")).toContain("text-text-secondary");
    await expectNoA11yViolations(container);
  });

  it("022/US1-1 conta no escuro: interruptor desligado e a lua em destaque", () => {
    const { container } = renderWithProviders(<AppearanceSettings theme="DARK" />);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[data-theme-icon="dark"]')!.getAttribute("class")).toContain("text-foreground");
  });

  it("022/US1-2 022/SC-001 ligar o tema claro troca o tema antes da resposta e envia { theme: LIGHT }", async () => {
    const held = heldFetch();
    fetchMock.mockReturnValue(held.pending);
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(toggle());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect((toggle() as HTMLButtonElement).disabled).toBe(true);
    expect(toggle().getAttribute("aria-busy")).toBe("true");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/me/preferences");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ theme: "LIGHT" });

    await held.release(json({ theme: "LIGHT" }));
    await waitFor(() => expect((toggle() as HTMLButtonElement).disabled).toBe(false));
    expect(toggle().getAttribute("aria-busy")).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("022/US1-2 o teclado alterna: Espaço liga o tema claro", async () => {
    fetchMock.mockResolvedValue(json({ theme: "LIGHT" }));
    renderWithProviders(<AppearanceSettings theme="DARK" />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(toggle());
    await user.keyboard(" ");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toEqual({ theme: "LIGHT" });
  });

  it("022/US1-4 desligar volta ao tema escuro", async () => {
    document.documentElement.dataset.theme = "light";
    fetchMock.mockResolvedValue(json({ theme: "DARK" }));
    renderWithProviders(<AppearanceSettings theme="LIGHT" />);

    await userEvent.setup().click(toggle());

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toEqual({ theme: "DARK" });
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("022/US1-5 com a falha, o tema e a posição anteriores voltam e a mensagem aparece", async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }, 500));
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(toggle());

    expect((await screen.findByRole("alert")).textContent).toBe(FAILURE);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("022/US1-5 sessão expirada (401): o tema anterior volta e a mensagem é a de autenticação do app", async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 401, code: "UNAUTHENTICATED", message: "x" }, 401));
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(toggle());

    expect((await screen.findByRole("alert")).textContent).toBe("Autenticação necessária.");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });
});
