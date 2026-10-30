import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toast";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { REGISTRY } from "../registry";
import { Catalog } from "./catalog";

// 005 US4 (FR-031; contracts/components.md, contracts/layouts.md; research V14, V17).

vi.mock("next/navigation", () => ({
  usePathname: () => "/design-system",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

const renderInApp = (ui: React.ReactElement) => renderWithProviders(<Toaster>{ui}</Toaster>);

/**
 * Component names in contracts/components.md: each `### Name (` heading and the first cell of
 * each table row. A cell with several names ("`Dialog` / `AlertDialog`") lists alternatives.
 */
function contractComponents(): string[][] {
  const contract = readFileSync(join(process.cwd(), "../../specs/005-design-system/contracts/components.md"), "utf8");
  const headings = [...contract.matchAll(/^### (\w+) \(/gm)].map(([, name]) => [name!]);
  const rows = contract
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => [...line.split("|")[1]!.matchAll(/`(\w+)`/g)].map(([, name]) => name!));
  return [...headings, ...rows];
}

const names = REGISTRY.map((entry) => entry.name);

describe("005/US4-1 005/SC-005 o catálogo lista os componentes e os layouts", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("o registro tem cada componente de contracts/components.md e os layouts AppShell e StudentLayout", () => {
    const missing = contractComponents().filter((alternatives) => !alternatives.some((name) => names.includes(name)));
    expect(missing).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(["AppShell", "StudentLayout"]));
    expect(new Set(REGISTRY.map((entry) => entry.id)).size).toBe(REGISTRY.length);
  });

  it("cada entrada aparece com o nome, a origem e o mostruário", () => {
    const { container } = renderInApp(<Catalog />);
    for (const entry of REGISTRY) {
      const section = container.querySelector(`section#${entry.id}`);
      expect(section, entry.name).not.toBeNull();
      expect(within(section as HTMLElement).getByRole("heading", { level: 3, name: entry.name })).toBeTruthy();
      expect(section?.textContent).toContain(entry.source);
      expect(section?.querySelector(`[data-showcase="${entry.id}"]`), entry.name).not.toBeNull();
    }
  });
});

describe("005/US4-2 cada mostruário mostra variantes e estados", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(REGISTRY.map((entry) => [entry.name, entry] as const))("%s renderiza o que declara", (_name, entry) => {
    const Showcase = entry.showcase;
    const { container } = renderInApp(<Showcase />);
    const samples = [...entry.variants, ...entry.states];
    expect(samples.length).toBeGreaterThan(0);
    const rendered = [...container.querySelectorAll("[data-sample]")].map((sample) =>
      sample.getAttribute("data-sample"),
    );
    expect(rendered).toEqual(expect.arrayContaining(samples));
    for (const sample of container.querySelectorAll("[data-sample]")) {
      expect(sample.querySelector("figcaption")?.textContent).toBe(sample.getAttribute("data-sample"));
    }
  });

  it.each([
    ["Button", ["desabilitado", "carregando"]],
    ["Input", ["erro", "desabilitado"]],
    ["Textarea", ["erro", "desabilitado"]],
    ["NativeSelect", ["erro", "desabilitado"]],
    ["Select", ["erro", "desabilitado"]],
    ["Checkbox", ["erro", "desabilitado"]],
    ["Radio", ["desabilitado"]],
    ["Switch", ["desabilitado"]],
    ["FormField", ["erro", "sucesso", "desabilitado"]],
    ["Tabs", ["desabilitado"]],
    ["Skeleton", ["carregando"]],
    ["Spinner", ["carregando"]],
  ])("%s mostra os estados %j", (name, states) => {
    expect(REGISTRY.find((entry) => entry.name === name)?.states).toEqual(expect.arrayContaining(states));
  });

  it("há uma faixa com a largura de tablet (768 px)", () => {
    const { container } = renderInApp(<Catalog />);
    const frames = container.querySelectorAll('[data-slot="tablet-frame"]');
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.getAttribute("class")).toMatch(/\bmax-w-192\b/);
      expect(frame.textContent).toContain("768 px");
    }
  });
});

/**
 * Elements a Tab press should reach: one per radio group (its checked radio, else the first), nothing
 * disabled, hidden or removed from the order. A Radix tab list is a roving focus group that hands its
 * focus to the selected tab.
 */
function tabbable(container: Element): HTMLElement[] {
  const candidates = [
    ...container.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
  ].filter(
    (element) =>
      element.tabIndex >= 0 && !element.matches(':disabled, [role="tablist"]') && !element.closest("[inert], [hidden]"),
  );
  const isRadio = (element: HTMLElement): element is HTMLInputElement =>
    element instanceof HTMLInputElement && element.type === "radio" && element.name !== "";
  const entry = new Map<string, HTMLInputElement>();
  for (const element of candidates) {
    if (!isRadio(element)) continue;
    const chosen = entry.get(element.name);
    if (!chosen || (element.checked && !chosen.checked)) entry.set(element.name, element);
  }
  return candidates.filter((element) => !isRadio(element) || entry.get(element.name) === element);
}

const hidesOutline = (element: Element) =>
  /(^|\s)outline-(none|hidden)(\s|$)/.test(element.getAttribute("class") ?? "");
const replacesOutline = (element: Element) =>
  /(^|\s)focus-visible:(ring|outline|border)/.test(element.getAttribute("class") ?? "");

// 022/US3-5 (research Z9): axe and the Tab order run in both themes.
describe.each(["dark", "light"])("005/SC-003 005/SC-004 022/US3-5 catálogo acessível e operável pelo teclado (tema %s)", (theme) => {
  beforeEach(() => {
    document.documentElement.dataset.theme = theme;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it("sem violações de acessibilidade", async () => {
    const { container } = renderInApp(<Catalog />);
    await expectNoA11yViolations(container);
  }, 30_000);

  it("todo controle é alcançado por Tab e mantém o foco visível", async () => {
    const user = userEvent.setup();
    const { container } = renderInApp(<Catalog />);
    // 014: each editable CodeEditor swaps its textarea for CodeMirror once the chunk loads.
    await waitFor(() => expect(container.querySelector('[data-slot="code-editor"] textarea:not([readonly])')).toBeNull());
    const expected = tabbable(container);
    expect(expected.length).toBeGreaterThan(REGISTRY.length);
    const seen = new Set<Element>();
    for (let i = 0; i < expected.length * 3 && !expected.every((element) => seen.has(element)); i += 1) {
      // 012 CodeEditor: Tab indents inside the editor; Esc then Tab leaves it (exam-mode.md).
      if (document.activeElement?.closest('[data-slot="code-editor"]')) await user.keyboard("{Escape}");
      await user.tab();
      const focused = document.activeElement;
      if (focused && container.contains(focused)) seen.add(focused);
    }
    const describe = (element: Element) =>
      element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.id;
    expect(expected.filter((element) => !seen.has(element)).map(describe)).toEqual([]);
    expect(
      [...seen].filter((element) => hidesOutline(element) && !replacesOutline(element)).map(describe),
      "foco sem contorno visível",
    ).toEqual([]);
    expect(screen.queryAllByRole("dialog")).toEqual([]);
  }, 60_000);
});

describe("022/FR-014 022/US3-5 o catálogo mostra os componentes nos dois temas", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    document.documentElement.dataset.theme = "dark";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it("o seletor \"Tema do catálogo\" troca data-theme de <html> sem chamar a API, e a saída do catálogo devolve o tema", async () => {
    const user = userEvent.setup();
    const { unmount } = renderInApp(<Catalog />);
    const group = screen.getByRole("group", { name: "Tema do catálogo" });
    const dark = within(group).getByRole("radio", { name: "Escuro" }) as HTMLInputElement;
    const light = within(group).getByRole("radio", { name: "Claro" }) as HTMLInputElement;
    expect(dark.checked).toBe(true);

    await user.click(light);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(light.checked).toBe(true);
    await user.click(dark);
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(light);

    unmount();
    expect(document.documentElement.dataset.theme, "o tema da conta volta ao sair do catálogo").toBe("dark");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("começa no tema que a página já tem", () => {
    document.documentElement.dataset.theme = "light";
    renderInApp(<Catalog />);
    const group = screen.getByRole("group", { name: "Tema do catálogo" });
    expect((within(group).getByRole("radio", { name: "Claro" }) as HTMLInputElement).checked).toBe(true);
  });
});
