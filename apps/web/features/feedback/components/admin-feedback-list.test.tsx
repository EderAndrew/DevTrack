import type { AdminFeedbackListItem } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json } from "@/features/student-activities/components/test-fixtures";
import { filtersFromSearch, filtersHref } from "../schemas/admin-feedback";
import { AdminFeedbackList } from "./admin-feedback-list";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const item = (overrides: Partial<AdminFeedbackListItem> = {}): AdminFeedbackListItem => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  category: "PROBLEM",
  status: "RECEIVED",
  excerpt: "A página travou ao salvar a resposta.",
  student: { id: "bbbbbbbb-0000-4000-8000-000000000001", name: "Ana Souza" },
  createdAt: "2026-10-25T12:00:00.000Z",
  ...overrides,
});

function setup(pages: Record<string, { items: AdminFeedbackListItem[]; nextCursor: string | null }>, initialFilters = {}) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return json(200, pages[url] ?? { items: [], nextCursor: null });
    }),
  );
  const view = renderWithProviders(<AdminFeedbackList initialFilters={initialFilters} />);
  return { ...view, urls, user: userEvent.setup() };
}

describe("020/US2 lista de feedbacks do ADMIN", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("020/US2-1 mostra categoria, situação em palavras, trecho, aluno e data, com link para o detalhe; Carregar mais", async () => {
    const { user, urls, container } = setup({
      "/api/feedbacks": { items: [item(), item({ id: "aaaaaaaa-0000-4000-8000-000000000002", category: "PRAISE", status: "IN_REVIEW", excerpt: "Gostei do editor.", student: { id: "bbbbbbbb-0000-4000-8000-000000000002", name: "Bruno Lima" } })], nextCursor: "c1" },
      "/api/feedbacks?cursor=c1": { items: [item({ id: "aaaaaaaa-0000-4000-8000-000000000003", excerpt: "Mais antigo." })], nextCursor: null },
    });
    const link = await screen.findByRole("link", { name: "A página travou ao salvar a resposta." });
    expect(link.getAttribute("href")).toBe("/admin/feedbacks/aaaaaaaa-0000-4000-8000-000000000001");
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Problema")).toBeTruthy();
    expect(within(rows[0]!).getByText("Recebido")).toBeTruthy();
    expect(within(rows[0]!).getByText("Ana Souza")).toBeTruthy();
    expect(within(rows[1]!).getByText("Elogio")).toBeTruthy();
    expect(within(rows[1]!).getByText("Em análise")).toBeTruthy();
    expect(rows[0]!.textContent).toContain("25/10/2026");
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("link", { name: "Mais antigo." })).toBeTruthy();
    expect(urls).toEqual(["/api/feedbacks", "/api/feedbacks?cursor=c1"]);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("020/US2-2 os filtros vão para a API e para o URL (?situacao=&categoria=)", async () => {
    const { user, urls } = setup({}, { status: "RESOLVED" });
    expect(await screen.findByText("Nenhum feedback com esses filtros.")).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Situação" }) as HTMLSelectElement).value).toBe("RESOLVED");

    await user.selectOptions(screen.getByRole("combobox", { name: "Categoria" }), "Problema");
    expect(router.replace).toHaveBeenLastCalledWith("/admin/feedbacks?situacao=resolvido&categoria=problema", { scroll: false });
    await user.selectOptions(screen.getByRole("combobox", { name: "Situação" }), "Todas");
    expect(router.replace).toHaveBeenLastCalledWith("/admin/feedbacks?categoria=problema", { scroll: false });
    await vi.waitFor(() => expect(urls).toEqual(["/api/feedbacks?status=RESOLVED", "/api/feedbacks?status=RESOLVED&category=PROBLEM", "/api/feedbacks?category=PROBLEM"]));
  });

  it("020/US2-2 o URL vira filtros; valor desconhecido ou repetido = Todas", () => {
    expect(filtersFromSearch({ situacao: "em-analise", categoria: "sugestao" })).toEqual({ status: "IN_REVIEW", category: "SUGGESTION" });
    expect(filtersFromSearch({ situacao: "IN_REVIEW", categoria: ["problema", "elogio"] })).toEqual({ status: undefined, category: undefined });
    expect(filtersHref({})).toBe("/admin/feedbacks");
    expect(filtersHref({ status: "ARCHIVED" })).toBe("/admin/feedbacks?situacao=arquivado");
  });

  it("020/SC-007 o trecho com HTML e URL aparece como texto", async () => {
    setup({ "/api/feedbacks": { items: [item({ excerpt: "<img src=x onerror=alert(1)> veja https://exemplo.com" })], nextCursor: null } });
    const link = await screen.findByRole("link", { name: "<img src=x onerror=alert(1)> veja https://exemplo.com" });
    expect(link.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
