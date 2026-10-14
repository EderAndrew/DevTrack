import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ExamDetail } from "./exam-detail";
import { examApiMock, examView, json } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const EXAM = examView();
const COMPLETE = examView({ questions: EXAM.questions.map((question) => ({ ...question, difficulty: "BASIC" as const })) });

describe("018/US1 ExamDetail — aprovar, arquivar e editar uma prova", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];
  const serve = (exam = EXAM, onWrite = (url: string) => json(200, url.endsWith("/approve") ? { ...exam, status: "APPROVED", version: 2 } : exam)) =>
    fetchMock.mockImplementation(
      examApiMock(
        (url, body) => {
          writes.push({ url, body });
          return onWrite(url);
        },
        { [`/api/exams/${exam.id}`]: () => json(200, exam) },
      ),
    );

  beforeEach(() => {
    fetchMock.mockReset();
    writes.length = 0;
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const render = () => renderWithProviders(<ExamDetail examId={EXAM.id} canEdit canApprove canArchive />);

  it("018/US1-2 \"Aprovar\" lista as questões que bloqueiam, cada uma com um link, e não aprova", async () => {
    serve();
    const { container } = render();
    const user = userEvent.setup();
    expect(await screen.findByText("Rascunho")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("A prova ainda não pode ser aprovada")).toBeTruthy();
    const link = within(dialog).getByRole("link", { name: "Questão 2: sem dificuldade." });
    expect(link.getAttribute("href")).toBe("#questao-2");
    expect(within(dialog).queryByRole("button", { name: "Aprovar prova" })).toBeNull();
    await expectNoA11yViolations(container);
    expect(writes).toHaveLength(0);
  });

  it("018/FR-004 com tudo completo, aprova a versão lida e avisa", async () => {
    serve(COMPLETE);
    render();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Aprovar" }));
    await user.click(await screen.findByRole("button", { name: "Aprovar prova" }));
    await waitFor(() => expect(screen.getByText("Prova aprovada.")).toBeTruthy());
    expect(writes).toEqual([{ url: `/api/exams/${EXAM.id}/approve`, body: { version: 1 } }]);
  });

  it("018/FR-004 a prova arquivada é só leitura e pode ser restaurada", async () => {
    serve(examView({ status: "ARCHIVED", archivedFromStatus: "APPROVED" }));
    render();
    expect(await screen.findByText(/Prova arquivada: não pode ser editada nem aprovada. Ao restaurar, volta a aprovada./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprovar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
    expect(screen.getByLabelText(/^Título/).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Restaurar" })).toBeTruthy();
  });
});
