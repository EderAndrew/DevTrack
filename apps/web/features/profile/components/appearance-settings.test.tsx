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

  it("022/US1-1 seção Aparência com o grupo Tema marcado pelo tema da conta, sem violações axe", async () => {
    const { container } = renderWithProviders(<AppearanceSettings theme="LIGHT" />);
    expect(screen.getByRole("heading", { level: 2, name: "Aparência" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Tema" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("radio", { name: "Claro" }) as HTMLInputElement).checked).toBe(true);
    await expectNoA11yViolations(container);
  });

  it("022/US1-2 022/SC-001 escolher Claro troca o tema antes da resposta e envia { theme: LIGHT }", async () => {
    const held = heldFetch();
    fetchMock.mockReturnValue(held.pending);
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Claro" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    const group = screen.getByRole("group", { name: "Tema" }) as HTMLFieldSetElement;
    expect(group.disabled).toBe(true);
    expect(group.getAttribute("aria-busy")).toBe("true");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/me/preferences");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ theme: "LIGHT" });

    await held.release(json({ theme: "LIGHT" }));
    await waitFor(() => expect(group.disabled).toBe(false));
    expect(group.getAttribute("aria-busy")).toBe("false");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("radio", { name: "Claro" }) as HTMLInputElement).checked).toBe(true);
  });

  it("022/US1-4 escolher Escuro volta ao tema escuro", async () => {
    document.documentElement.dataset.theme = "light";
    fetchMock.mockResolvedValue(json({ theme: "DARK" }));
    renderWithProviders(<AppearanceSettings theme="LIGHT" />);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Escuro" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toEqual({ theme: "DARK" });
    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(true);
  });

  it("022/US1-5 com a falha, o tema e a opção anteriores voltam e a mensagem aparece", async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 500, code: "INTERNAL_ERROR", message: "x" }, 500));
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Claro" }));

    expect((await screen.findByRole("alert")).textContent).toBe(FAILURE);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("022/US1-5 sessão expirada (401): o tema anterior volta e a mensagem é a de autenticação do app", async () => {
    fetchMock.mockResolvedValue(json({ statusCode: 401, code: "UNAUTHENTICATED", message: "x" }, 401));
    renderWithProviders(<AppearanceSettings theme="DARK" />);

    await userEvent.setup().click(screen.getByRole("radio", { name: "Claro" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Autenticação necessária.");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect((screen.getByRole("radio", { name: "Escuro" }) as HTMLInputElement).checked).toBe(true);
  });

  it("022/US1-2 escolher a opção já marcada não envia nada", async () => {
    renderWithProviders(<AppearanceSettings theme="DARK" />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Escuro" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
