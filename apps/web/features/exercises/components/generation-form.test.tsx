import { screen } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExerciseBatchesList } from "./exercise-batches-list";
import { GenerationForm } from "./generation-form";
import { apiError, batchView, exerciseApiMock, json, POO, POO_REVISION } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));


describe("010/US2 GenerationForm — Criar com IA", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];
  let availability = "AVAILABLE";

  /** The exercise mock, plus the availability; the POST answers `answer`. */
  const serve = (answer: () => Response = () => json(202, batchView())) => {
    const base = exerciseApiMock((url, body) => {
      writes.push({ url, body });
      return answer();
    });
    fetchMock.mockImplementation(async (input, init) =>
      String(input) === "/api/exercise-generation/availability" ? json(200, { availability }) : base(input, init),
    );
  };

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    availability = "AVAILABLE";
    serve();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  async function chooseTopic(user: UserEvent) {
    await screen.findByRole("option", { name: POO.name });
    await user.selectOptions(screen.getByRole("combobox", { name: /^Disciplina/ }), POO.name);
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Versão 1" })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText(/^Ementa/), "Versão 1");
    await vi.waitFor(() => expect(screen.getByRole("option", { name: "Herança" })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText(/^Tópico/), "Herança");
  }

  it("010/US2-1 pede o lote com o tópico, a dificuldade, a distribuição e as pegadinhas, e vai para os lotes", async () => {
    const { container } = renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    expect(screen.getByText(/Linguagem da ementa:/).parentElement!.textContent).toContain("Java");
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Intermediário");
    // The default: 5 exercises, open answer and multiple choice, distributed automatically.
    expect(screen.getByText("Serão gerados: Pergunta e resposta 3 · Múltipla escolha 2.")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "1");
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Gerar exercícios" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/exercicios/lotes?pedido=1"));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toBe("/api/exercise-batches");
    expect(writes[0]!.body).toEqual({
      syllabusRevisionId: POO_REVISION.id,
      syllabusItemId: POO_REVISION.groups[0]!.items[0]!.id,
      difficulty: "INTERMEDIATE",
      total: 5,
      types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
      distribution: { mode: "AUTO" },
      trickQuestions: 1,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("010/US2-4 a prévia da distribuição automática é a do servidor: 10 em 3 tipos → 4, 3 e 3", async () => {
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    await user.selectOptions(screen.getByLabelText(/^Quantidade de exercícios/), "10");
    await user.click(screen.getByLabelText("Exercício de código"));
    expect(screen.getByText("Serão gerados: Pergunta e resposta 4 · Múltipla escolha 3 · Exercício de código 3.")).toBeTruthy();
  });

  it("validação espelhada: sem tópico nem dificuldade, erro por campo e no resumo, sem pedido", async () => {
    const { container } = renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /^Disciplina/ });
    await user.click(screen.getByRole("button", { name: "Gerar exercícios" }));
    const summary = await screen.findByRole("group", { name: "Não foi possível pedir os exercícios" });
    expect(summary.textContent).toContain("Escolha o tópico da ementa.");
    expect(summary.textContent).toContain("Escolha a dificuldade.");
    expectFieldErrorLinked(screen.getByLabelText(/^Tópico/));
    expectFieldErrorLinked(screen.getByLabelText(/^Dificuldade/));
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("010/US2-4 010/US2-5 distribuição manual com soma diferente e pegadinhas acima da múltipla escolha são recusadas no formulário", async () => {
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Básico");
    await user.click(screen.getByLabelText("Definir quantidade por tipo"));
    await user.type(screen.getByLabelText(/^Pergunta e resposta/, { selector: "input[type=number]" }), "4");
    await user.type(screen.getByLabelText(/^Múltipla escolha/, { selector: "input[type=number]" }), "2");
    await user.click(screen.getByRole("button", { name: "Gerar exercícios" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir os exercícios" })).textContent).toContain("a soma deve ser igual ao total");

    const multipleChoice = screen.getByLabelText(/^Múltipla escolha/, { selector: "input[type=number]" });
    await user.clear(multipleChoice);
    await user.type(multipleChoice, "1");
    await user.selectOptions(screen.getByLabelText(/^Pegadinhas/), "2");
    await user.click(screen.getByRole("button", { name: "Gerar exercícios" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("group", { name: "Não foi possível pedir os exercícios" }).textContent).toContain(
        "As pegadinhas não podem passar do número de questões de múltipla escolha.",
      ),
    );
    expect(writes).toHaveLength(0);
  });

  it("010/US2-5 pegadinhas só com Múltipla escolha", async () => {
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /^Disciplina/ });
    expect((screen.getByLabelText(/^Pegadinhas/) as HTMLSelectElement).disabled).toBe(false);
    await user.click(screen.getByLabelText("Múltipla escolha"));
    expect((screen.getByLabelText(/^Pegadinhas/) as HTMLSelectElement).disabled).toBe(true);
  });

  it("010/US2-8 ementa sem linguagem: Exercício de código indisponível, com a indicação de definir a linguagem", async () => {
    const noLanguage = { ...POO_REVISION, language: null };
    const base = exerciseApiMock(() => json(202, batchView()));
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/exercise-generation/availability") return json(200, { availability: "AVAILABLE" });
      if (url === `/api/syllabus-revisions/${POO_REVISION.id}`) return json(200, noLanguage);
      return base(input, init);
    });
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    const code = screen.getByLabelText("Exercício de código") as HTMLInputElement;
    await vi.waitFor(() => expect(code.disabled).toBe(true));
    expect(screen.getByText(/defina-a numa nova revisão da ementa/)).toBeTruthy();
    expect(screen.getByText(/Linguagem da ementa:/).parentElement!.textContent).toContain("Nenhuma");
  });

  it("010/US2-7 indisponível: aviso com o caminho manual e botão desabilitado", async () => {
    availability = "MODEL_UNAVAILABLE";
    const { container } = renderWithProviders(<GenerationForm />);
    expect(await screen.findByText(/A geração com IA está indisponível no momento\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar manualmente" }).getAttribute("href")).toBe("/exercicios/novo");
    await vi.waitFor(() => expect((screen.getByRole("button", { name: "Gerar exercícios" }) as HTMLButtonElement).disabled).toBe(true));
    await expectNoA11yViolations(container);
  });

  it("erro da API aparece no resumo", async () => {
    serve(() => apiError(422, "SYLLABUS_LANGUAGE_REQUIRED", "x"));
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Básico");
    await user.click(screen.getByRole("button", { name: "Gerar exercícios" }));
    expect((await screen.findByRole("group", { name: "Não foi possível pedir os exercícios" })).textContent).toContain(
      "Defina a linguagem da ementa",
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it("SC-012 a ordem de Tab segue o formulário", async () => {
    renderWithProviders(<GenerationForm />);
    const user = userEvent.setup();
    await chooseTopic(user);
    await expectTabOrder(user, [
      screen.getByLabelText(/^Disciplina/),
      screen.getByLabelText(/^Ementa/),
      screen.getByLabelText(/^Tópico/),
      screen.getByLabelText(/^Dificuldade/),
      screen.getByLabelText(/^Quantidade de exercícios/),
      screen.getByLabelText("Pergunta e resposta"),
      screen.getByLabelText("Múltipla escolha"),
      screen.getByLabelText(/^Pegadinhas/),
      screen.getByRole("button", { name: "Gerar exercícios" }),
    ]);
  });
});

describe("010/US2 ExerciseBatchesList — lotes gerados", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra a situação em palavras (nunca só pela cor) e o aviso do pedido", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        items: [
          batchView({ id: "00000000-0000-4000-d000-000000000001", status: "PENDING" }),
          batchView({ id: "00000000-0000-4000-d000-000000000002", status: "GENERATED", pendingReview: 5, generatedAt: "2026-09-28T12:01:00.000Z" }),
          batchView({ id: "00000000-0000-4000-d000-000000000003", status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED" }),
        ],
        nextCursor: null,
      }),
    );
    const { container } = renderWithProviders(<ExerciseBatchesList requested />);
    expect((await screen.findAllByRole("heading", { level: 2, name: "Herança" }))).toHaveLength(3);
    expect(screen.getByText("Gerando")).toBeTruthy();
    expect(screen.getByText("Gerado — 5 para revisar")).toBeTruthy();
    expect(screen.getByText("Falhou")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Pedido enviado.");
    expect(screen.getAllByText(/Intermediário · 5 exercícios \(Pergunta e resposta 3 · Múltipla escolha 2\) · 1 pegadinha/)).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it("sem lotes: estado vazio com Criar com IA", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<ExerciseBatchesList requested={false} />);
    expect(await screen.findByText("Nenhum lote gerado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar com IA" }).getAttribute("href")).toBe("/exercicios/gerar");
  });
});
