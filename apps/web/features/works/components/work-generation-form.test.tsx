import { WorkQuestionTypeSchema } from "@repo/contracts";
import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import {
  apiError,
  generationRequestView,
  itemId,
  json,
  POO,
  POO_REVISION,
  workApiMock,
} from "./test-fixtures";
import { WorkGenerationForm } from "./work-generation-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("011/US3 WorkGenerationForm — Criar trabalho com IA", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];
  let availability = "AVAILABLE";
  let revision = POO_REVISION;

  /** The work mock, plus the availability and the revision; the POST answers `answer`. */
  const serve = (answer: () => Response = () => json(202, generationRequestView())) => {
    const base = workApiMock((url, body) => {
      writes.push({ url, body });
      return answer();
    });
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/work-generation/availability") return json(200, { availability });
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
    await screen.findByRole("group", { name: "Tópicos do trabalho" });
  }

  async function fillWork(user: UserEvent) {
    await user.type(screen.getByLabelText(/^Título/), "Trabalho de herança");
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Intermediário");
    await user.type(screen.getByLabelText(/^Nota total/), "2,00");
  }

  it("011/US3-1 pede o trabalho com os tópicos, título, nota, dificuldade, distribuição e pegadinhas, e abre o pedido", async () => {
    const { container } = renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    expect(screen.getByText(/Linguagem da ementa:/).parentElement!.textContent).toContain("Java");
    await user.click(screen.getByLabelText("Herança"));
    await user.click(screen.getByLabelText("Polimorfismo"));
    await user.click(screen.getByLabelText("Interfaces"));
    await fillWork(user);
    await user.selectOptions(screen.getByLabelText(/^Quantidade de questões/), "10");
    await user.click(screen.getByLabelText("Código"));
    await user.click(screen.getByLabelText("Definir quantidade por tipo"));
    await user.type(screen.getByLabelText(/^Pergunta e resposta/, { selector: "input[type=number]" }), "3");
    await user.type(screen.getByLabelText(/^Múltipla escolha/, { selector: "input[type=number]" }), "4");
    await user.type(screen.getByLabelText(/^Código/, { selector: "input[type=number]" }), "3");
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "2");
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Gerar trabalho" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/trabalhos/pedidos/${generationRequestView().id}`));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toBe("/api/work-generation-requests");
    expect(writes[0]!.body).toEqual({
      subjectId: POO.id,
      syllabusRevisionId: POO_REVISION.id,
      syllabusItemIds: [itemId("Herança"), itemId("Polimorfismo"), itemId("Interfaces")],
      title: "Trabalho de herança",
      difficulty: "INTERMEDIATE",
      totalGrade: "2.00",
      total: 10,
      types: WorkQuestionTypeSchema.options,
      distribution: { mode: "MANUAL", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 4, CODE: 3 } },
      trickQuestions: 2,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("011/US3-5 a prévia da distribuição automática é a do servidor: 10 em 3 tipos → 4, 3 e 3", async () => {
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.selectOptions(screen.getByLabelText(/^Quantidade de questões/), "10");
    await user.click(screen.getByLabelText("Código"));
    expect(screen.getByText("Serão geradas: Pergunta e resposta 4 · Múltipla escolha 3 · Código 3.")).toBeTruthy();
  });

  it("011/US3-2 validação espelhada: sem tópico, título, dificuldade nem nota → erro por campo e no resumo, sem pedido", async () => {
    const { container } = renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByRole("button", { name: "Gerar trabalho" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível pedir o trabalho" });
    expect(summary.textContent).toContain("Escolha de 1 a 10 tópicos da ementa.");
    expect(summary.textContent).toContain("Informe o título do trabalho.");
    expect(summary.textContent).toContain("Escolha a dificuldade.");
    expect(summary.textContent).toContain("Informe a nota de 0,01 a 100,00");
    expectFieldErrorLinked(screen.getByLabelText(/^Título/));
    expectFieldErrorLinked(screen.getByLabelText(/^Dificuldade/));
    expectFieldErrorLinked(screen.getByLabelText(/^Nota total/));
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("011/FR-021 mais de 3 tópicos por questão: o limite é explicado e o pedido não sai", async () => {
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    for (const topic of ["Herança", "Polimorfismo", "Interfaces", "Listas"]) await user.click(screen.getByLabelText(topic));
    await fillWork(user);
    await user.selectOptions(screen.getByLabelText(/^Quantidade de questões/), "1");
    await user.click(screen.getByLabelText("Múltipla escolha"));
    expect(screen.getByText(/Com 1 questão, escolha até 3 tópicos\./)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gerar trabalho" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir o trabalho" })).textContent).toContain(
      "Cada questão trata de até 3 tópicos",
    );
    expect(writes).toHaveLength(0);
  });

  it("011/US3-6 pegadinhas só com Múltipla escolha e nunca acima dela", async () => {
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await fillWork(user);
    await user.click(screen.getByLabelText("Definir quantidade por tipo"));
    await user.type(screen.getByLabelText(/^Pergunta e resposta/, { selector: "input[type=number]" }), "4");
    await user.type(screen.getByLabelText(/^Múltipla escolha/, { selector: "input[type=number]" }), "1");
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "2");
    await user.click(screen.getByRole("button", { name: "Gerar trabalho" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir o trabalho" })).textContent).toContain(
      "As pegadinhas não podem passar do número de questões de múltipla escolha.",
    );
    expect(writes).toHaveLength(0);
    await user.click(screen.getByLabelText("Múltipla escolha", { selector: "input[type=checkbox]" }));
    expect((screen.getByLabelText(/^Pegadinhas/) as HTMLSelectElement).disabled).toBe(true);
  });

  it("011/US3-9 ementa sem linguagem: Código indisponível, com a indicação de definir a linguagem", async () => {
    revision = { ...POO_REVISION, language: null };
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    const code = screen.getByLabelText("Código") as HTMLInputElement;
    await vi.waitFor(() => expect(code.disabled).toBe(true));
    expect(screen.getByText(/defina-a numa nova revisão da ementa/)).toBeTruthy();
    expect(screen.getByText(/Linguagem da ementa:/).parentElement!.textContent).toContain("Nenhuma");
  });

  it("011/US3-8 indisponível: aviso com o caminho manual e botão desabilitado", async () => {
    availability = "AGENT_DISABLED";
    const { container } = renderWithProviders(<WorkGenerationForm />);
    expect(await screen.findByText(/A geração com IA está indisponível no momento\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar trabalho manualmente" }).getAttribute("href")).toBe("/trabalhos/novo");
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Gerar trabalho" }) as HTMLButtonElement).disabled).toBe(true));
    await expectNoA11yViolations(container);
  });

  it("erro da API aparece no resumo", async () => {
    serve(() => apiError(409, "SUBJECT_ARCHIVED", "x"));
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await user.click(screen.getByLabelText("Herança"));
    await fillWork(user);
    await user.click(screen.getByRole("button", { name: "Gerar trabalho" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir o trabalho" })).textContent).toContain(
      "Esta disciplina está arquivada",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("SC-012 a ordem de Tab segue o formulário", async () => {
    renderWithProviders(<WorkGenerationForm />);
    const user = userEvent.setup();
    await chooseSyllabus(user);
    await expectTabOrder(user, [
      screen.getByLabelText(/^Disciplina/),
      screen.getByLabelText(/^Ementa/),
      screen.getByLabelText("Herança"),
      screen.getByLabelText("Polimorfismo"),
      screen.getByLabelText("Interfaces"),
      screen.getByLabelText("Listas"),
      screen.getByLabelText("Mapas"),
      screen.getByLabelText(/^Título/),
      screen.getByLabelText(/^Descrição/),
      screen.getByLabelText(/^Dificuldade/),
      screen.getByLabelText(/^Nota total/),
      screen.getByLabelText(/^Quantidade de questões/),
      screen.getByLabelText("Pergunta e resposta"),
      screen.getByLabelText("Múltipla escolha"),
      screen.getByLabelText("Código"),
    ]);
  });
});
