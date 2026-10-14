import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExamGenerationForm } from "./exam-generation-form";
import { apiError, examApiMock, examGenerationView, itemId, json, POO, POO_REVISION } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("018/US7 ExamGenerationForm — Criar prova com IA", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];
  let availability = "AVAILABLE";
  let revision = POO_REVISION;

  const serve = (answer: () => Response = () => json(202, examGenerationView())) => {
    const base = examApiMock((url, body) => {
      writes.push({ url, body });
      return answer();
    });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/exam-generation/availability") return json(200, { availability });
      if (url === `/api/syllabus-revisions/${POO_REVISION.id}`) return json(200, revision);
      return base(input, init);
    });
  };

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    availability = "AVAILABLE";
    revision = POO_REVISION;
    serve();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function chooseSyllabus(user: UserEvent) {
    await screen.findByRole("option", { name: POO.name });
    await user.selectOptions(screen.getByRole("combobox", { name: /^Disciplina/ }), POO.name);
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Versão 1" })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText(/^Ementa/), "Versão 1");
    await screen.findByRole("group", { name: "Tópicos da prova" });
  }

  async function fillExam(user: UserEvent, counts: [string, string, string] = ["2", "2", "1"]) {
    await user.type(screen.getByLabelText(/^Título/), "Prova de herança");
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Intermediário");
    await user.type(screen.getByLabelText(/^Nota total/), "10");
    const [open, choice, code] = counts;
    if (open) await user.type(screen.getByLabelText(/^Pergunta e resposta/), open);
    if (choice) await user.type(screen.getByLabelText(/^Múltipla escolha/), choice);
    if (code) await user.type(screen.getByLabelText(/^Código/), code);
  }

  it("018/US7-1 pede a prova com os tópicos, a dificuldade, a nota, a quantidade por tipo e as pegadinhas, e abre o pedido", async () => {
    const { container } = renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await user.click(screen.getByLabelText("Polimorfismo"));
    await fillExam(user);
    expect(screen.getByText("Total: 5 de 20 questões.")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "1");
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Gerar prova" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/provas/pedidos/${examGenerationView().id}`));
    expect(writes).toEqual([
      {
        url: "/api/exam-generation-requests",
        body: {
          subjectId: POO.id,
          syllabusRevisionId: POO_REVISION.id,
          topicIds: [itemId("Herança"), itemId("Polimorfismo")],
          title: "Prova de herança",
          difficulty: "INTERMEDIATE",
          totalGrade: "10",
          quantity: 5,
          distribution: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 2, CODE: 1 },
          trickCount: 1,
          idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
      },
    ]);
  });

  it("018/FR-005 até 20 questões: 21 no total é recusado no formulário, sem pedido", async () => {
    renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await fillExam(user, ["10", "10", "1"]);
    expect(screen.getByText("Total: 21 de 20 questões.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gerar prova" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível pedir a prova" });
    expect(summary.textContent).toContain("A prova precisa ter de 1 a 20 questões no total.");
    expect(writes).toHaveLength(0);
  });

  it("validação espelhada: sem tópico, título, dificuldade, nota nem questões → erro por campo e no resumo", async () => {
    const { container } = renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByRole("button", { name: "Gerar prova" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível pedir a prova" });
    for (const message of ["Escolha de 1 a 10 tópicos da ementa.", "Informe o título.", "Escolha a dificuldade.", "Informe a nota total.", "A prova precisa ter de 1 a 20 questões"]) {
      expect(summary.textContent).toContain(message);
    }
    expectFieldErrorLinked(screen.getByLabelText(/^Título/));
    expectFieldErrorLinked(screen.getByLabelText(/^Nota total/));
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("pegadinhas acima das questões de múltipla escolha são recusadas", async () => {
    renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await fillExam(user, ["3", "1", ""]);
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "2");
    await user.click(screen.getByRole("button", { name: "Gerar prova" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir a prova" })).textContent).toContain(
      "As pegadinhas não podem passar das questões de múltipla escolha.",
    );
    expect(writes).toHaveLength(0);
  });

  it("ementa sem linguagem: Código indisponível", async () => {
    revision = { ...POO_REVISION, language: null };
    renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await vi.waitFor(() => expect((screen.getByLabelText(/^Código/) as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByText(/Esta ementa não tem linguagem/)).toBeTruthy();
  });

  it("018/US7-3 indisponível: aviso com o caminho manual e botão desabilitado", async () => {
    availability = "AGENT_DISABLED";
    const { container } = renderWithProviders(<ExamGenerationForm />);
    expect(await screen.findByText(/A geração com IA não está disponível\. Crie a prova manualmente\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar prova manualmente" }).getAttribute("href")).toBe("/provas/nova");
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Gerar prova" }) as HTMLButtonElement).disabled).toBe(true));
    await expectNoA11yViolations(container);
  });

  it("erro da API aparece no resumo", async () => {
    serve(() => apiError(409, "AI_AGENT_DISABLED", "x"));
    renderWithProviders(<ExamGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await fillExam(user);
    await user.click(screen.getByRole("button", { name: "Gerar prova" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir a prova" })).textContent).toContain("Este recurso de IA está desativado");
    expect(router.push).not.toHaveBeenCalled();
  });
});
