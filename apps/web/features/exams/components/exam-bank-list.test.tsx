import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExamBankList } from "./exam-bank-list";
import { examApiMock, examSummary, json } from "./test-fixtures";

describe("018/US1 ExamBankList — consultar o Banco de Provas", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const lists: string[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    lists.length = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/exams")) {
        lists.push(url);
        return json(200, { items: [examSummary(), examSummary({ id: "00000000-0000-4000-e000-000000000109", title: "Prova aprovada", status: "APPROVED" })], nextCursor: null });
      }
      return examApiMock(() => json(500, {}))(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("018/FR-001 lista as provas com a situação em palavras e um link para cada uma", async () => {
    const { container } = renderWithProviders(<ExamBankList />);
    const link = await screen.findByRole("link", { name: "Prova de herança" });
    expect(link.getAttribute("href")).toBe("/provas/00000000-0000-4000-e000-000000000101");
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByText("Rascunho")).toBeTruthy();
    expect(within(rows[2]!).getByText("Aprovada")).toBeTruthy();
    expect(within(rows[1]!).getByText("2 questões · nota 10,00")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("018/FR-001 filtra por busca e situação no servidor, pelo teclado", async () => {
    renderWithProviders(<ExamBankList />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Prova de herança" });
    const search = screen.getByLabelText("Pesquisar no título");
    const subject = screen.getByLabelText("Disciplina");
    const status = screen.getByLabelText("Situação");
    await expectTabOrder(user, [search, subject, status]);
    await user.type(search, "herança");
    await user.selectOptions(status, "Arquivada");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await waitFor(() => expect(lists.at(-1)).toBe("/api/exams?q=heran%C3%A7a&status=ARCHIVED"));
  });
});
