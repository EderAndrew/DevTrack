import type { StudentFeedback } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { Toaster } from "@/components/ui/toast";
import { json } from "@/features/student-activities/components/test-fixtures";
import { MyFeedbacks } from "./my-feedbacks";

const feedback = (overrides: Partial<StudentFeedback> = {}): StudentFeedback => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  category: "PROBLEM",
  message: "A página travou ao salvar a resposta.",
  status: "RECEIVED",
  createdAt: "2026-10-25T12:00:00.000Z",
  ...overrides,
});

function setup(pages: Record<string, { items: StudentFeedback[]; nextCursor: string | null }>) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      return json(200, pages[url] ?? { items: [], nextCursor: null });
    }),
  );
  const view = renderWithProviders(
    <Toaster>
      <MyFeedbacks />
    </Toaster>,
  );
  return { ...view, urls, user: userEvent.setup() };
}

describe("020/US3 \"Meus feedbacks\"", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("020/US3-1 lista os próprios, mais recentes primeiro, com categoria, data, situação e o texto inteiro; Carregar mais", async () => {
    const { user, urls, container } = setup({
      "/api/me/feedbacks": {
        items: [
          feedback({ id: "aaaaaaaa-0000-4000-8000-000000000002", category: "PRAISE", message: "O editor de código ajudou muito.", status: "IN_REVIEW", createdAt: "2026-10-26T12:00:00.000Z" }),
          feedback(),
        ],
        nextCursor: "c1",
      },
      "/api/me/feedbacks?cursor=c1": { items: [feedback({ id: "aaaaaaaa-0000-4000-8000-000000000003", message: "O mais antigo de todos." })], nextCursor: null },
    });
    const items = within(await screen.findByRole("list", { name: "Meus feedbacks" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Elogio");
    expect(items[0]!.textContent).toContain("Em análise");
    expect(items[0]!.textContent).toContain("26 de out. de 2026");
    expect(items[0]!.textContent).toContain("O editor de código ajudou muito.");
    expect(items[1]!.textContent).toContain("Problema");
    expect(items[1]!.textContent).toContain("Recebido");
    expect(items[1]!.textContent).toContain("25 de out. de 2026");
    expect(screen.getByRole("button", { name: "Enviar feedback" })).toBeTruthy();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("O mais antigo de todos.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    expect(urls).toEqual(["/api/me/feedbacks", "/api/me/feedbacks?cursor=c1"]);
  });

  it("020/US3-2 a situação Resolvido em palavras, sem histórico nem nome do ADMIN", async () => {
    setup({ "/api/me/feedbacks": { items: [feedback({ status: "RESOLVED" })], nextCursor: null } });
    const item = within(await screen.findByRole("list", { name: "Meus feedbacks" })).getByRole("listitem");
    expect(item.textContent).toContain("Resolvido");
    expect(item.textContent).not.toMatch(/Histórico|Admin|→/);
  });

  it("020/US3-1 sem feedbacks: o aviso e o botão de enviar", async () => {
    const { container } = setup({});
    expect(await screen.findByText("Você ainda não enviou feedbacks.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar feedback" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Meus feedbacks" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("020/US3-1 a mensagem aparece como texto, nunca HTML", async () => {
    const message = '<img src=x onerror="alert(1)"> veja https://exemplo.com <b>negrito</b>';
    const { container } = setup({ "/api/me/feedbacks": { items: [feedback({ message })], nextCursor: null } });
    expect(await screen.findByText(message)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector('a[href="https://exemplo.com"]')).toBeNull();
  });
});
