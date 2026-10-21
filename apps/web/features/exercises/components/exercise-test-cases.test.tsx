import type { ProgrammingLanguageView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeEditorByLabel, typeCode } from "../../../test/code-editor";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExerciseDetail } from "./exercise-detail";
import { ExerciseForm } from "./exercise-form";
import { apiError, exerciseView, JAVA, json } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** A catalog language without execution (019 research B5). */
const C_LANGUAGE: ProgrammingLanguageView = { id: "00000000-0000-4000-a000-000000000003", key: "c", name: "C", highlight: "cpp", execution: null };

const form = () => screen.getByRole("form", { name: "Novo exercício" });
const section = () => within(form()).getByRole("group", { name: "Casos de teste" });
const testCase = (n: number) => within(section()).getByRole("group", { name: `Caso de teste ${n}` });

/** A CODE exercise ready to send, in the single form. */
async function fillCode(user: UserEvent, language = "Java") {
  const scope = within(form());
  await user.selectOptions(scope.getByLabelText(/^Tipo/), "Exercício de código");
  await user.type(scope.getByLabelText(/^Enunciado/), "Leia e dobre.");
  await user.selectOptions(scope.getByLabelText(/^Dificuldade/), "Básico");
  await user.selectOptions(scope.getByLabelText(/^Objetivo cognitivo/), "Aplicar");
  await user.type(scope.getByLabelText(/^Instruções/), "Use a entrada padrão.");
  (await codeEditorByLabel(/^Solução esperada/, form())).focus();
  await typeCode(user, "print(2)");
  await user.selectOptions(scope.getByLabelText(/^Linguagem/), language);
  await user.type(scope.getByLabelText(/^Explicação/), "Dobra.");
}

/** Adds a case and types its texts (`{enter}` is a line break). */
async function addCase(user: UserEvent, input: string, expectedOutput: string) {
  await user.click(within(section()).getByRole("button", { name: "Adicionar caso" }));
  const n = within(section()).getAllByRole("group", { name: /^Caso de teste \d+$/ }).length;
  if (input) await user.type(within(testCase(n)).getByLabelText(/^Entrada do caso/), input);
  if (expectedOutput) await user.type(within(testCase(n)).getByLabelText(/^Saída esperada do caso/), expectedOutput);
}

describe("019/US2 ExerciseTestCases — casos de teste no formulário do exercício de código", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];
  let answer: (body: unknown) => Response;

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    answer = () => json(201, exerciseView());
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method && init.method !== "GET") {
        const body = JSON.parse(String(init.body));
        writes.push({ url, body });
        return answer(body);
      }
      if (url === "/api/programming-languages") return json(200, [C_LANGUAGE, JAVA]);
      if (url.startsWith("/api/subjects?")) return json(200, { items: [], nextCursor: null });
      return apiError(404, "NOT_FOUND", "Não encontrado.");
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("019/US2-1 cada caso tem entrada (pode ser vazia), saída esperada e visibilidade; sai na ordem da tela", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await fillCode(user);
    await addCase(user, "1{enter}2", "3");
    await addCase(user, "", "0");
    await user.click(within(testCase(2)).getByRole("radio", { name: "Privado — fica só no servidor" }));
    await addCase(user, "5", "10");
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.url).toBe("/api/exercises");
    expect((writes[0]!.body as { testCases: unknown }).testCases).toEqual([
      { input: "1\n2", expectedOutput: "3", visibility: "PUBLIC" },
      { input: "", expectedOutput: "0", visibility: "PRIVATE" },
      { input: "5", expectedOutput: "10", visibility: "PUBLIC" },
    ]);
  });

  it("019/US2-1 mover para cima ou para baixo e remover mudam a ordem enviada; o foco fica no caso", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await fillCode(user);
    await addCase(user, "a", "A");
    await addCase(user, "b", "B");
    await addCase(user, "c", "C");
    expect((within(testCase(1)).getByRole("button", { name: /^Mover para cima/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(testCase(3)).getByRole("button", { name: /^Mover para baixo/ }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(testCase(3)).getByRole("button", { name: /^Mover para cima/ }));
    expect(screen.getByText("Caso 3 movido para a posição 2.")).toBeTruthy();
    expect(document.activeElement).toBe(within(testCase(2)).getByRole("button", { name: /^Mover para cima/ }));
    await user.click(within(testCase(1)).getByRole("button", { name: /^Remover/ }));
    expect(document.activeElement).toBe(within(section()).getByRole("button", { name: "Adicionar caso" }));

    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0]!.body as { testCases: { input: string }[] }).testCases.map((item) => item.input)).toEqual(["c", "b"]);
  });

  it("019/FR-001 até 20 casos: o botão desativa e diz o máximo", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await user.selectOptions(within(form()).getByLabelText(/^Tipo/), "Exercício de código");
    const add = within(section()).getByRole("button", { name: "Adicionar caso" });
    for (let i = 0; i < 20; i++) await user.click(add);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(within(section()).getByText("Máximo de 20 casos")).toBeTruthy();
    expect(within(section()).getAllByRole("group", { name: /^Caso de teste \d+$/ })).toHaveLength(20);
  });

  it("019/FR-001 saída esperada vazia: erro ligado ao campo do caso e no resumo, sem chamar a API", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await fillCode(user);
    await addCase(user, "1", "2");
    await addCase(user, "3", "");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    const field = within(testCase(2)).getByLabelText(/^Saída esperada do caso 2/);
    await waitFor(() => expectFieldErrorLinked(field));
    expect(screen.getByRole("link", { name: "Informe a saída esperada do caso." }).getAttribute("href")).toBe(`#${field.id}`);
    expect(within(testCase(1)).getByLabelText(/^Saída esperada do caso 1/).getAttribute("aria-invalid")).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("019/FR-001 o 422 EXERCISE_RULES da API cai no campo que ele aponta", async () => {
    answer = () =>
      json(422, {
        statusCode: 422,
        code: "EXERCISE_RULES",
        message: "x",
        details: { violations: [{ position: 0, field: "testCases.1.expectedOutput", reason: "TEST_CASE_EXPECTED_OUTPUT" }] },
      });
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await fillCode(user);
    await addCase(user, "1", "2");
    await addCase(user, "3", " ");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    const field = within(testCase(2)).getByLabelText(/^Saída esperada do caso 2/);
    await waitFor(() => expectFieldErrorLinked(field));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("019/FR-020 ao lado da linguagem: se os alunos poderão executar, pelo catálogo", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    const scope = within(form());
    await user.selectOptions(scope.getByLabelText(/^Tipo/), "Exercício de código");
    await waitFor(() => expect(scope.getByRole("option", { name: "Java" })).toBeTruthy());
    await user.selectOptions(scope.getByLabelText(/^Linguagem/), "Java");
    expect(scope.getByText("Os alunos poderão executar o código.")).toBeTruthy();
    await user.selectOptions(scope.getByLabelText(/^Linguagem/), "C");
    expect(scope.getByText("Sem execução nesta linguagem.")).toBeTruthy();
    expect(scope.queryByText("Os alunos poderão executar o código.")).toBeNull();
  });

  it("019/US2-2 outros tipos não têm a seção nem enviam casos", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await fillCode(user);
    await addCase(user, "1", "2");
    const scope = within(form());
    await user.selectOptions(scope.getByLabelText(/^Tipo/), "Pergunta e resposta");
    expect(scope.queryByRole("group", { name: "Casos de teste" })).toBeNull();
    await user.type(scope.getByLabelText(/^Resposta esperada/), "Resposta");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).not.toHaveProperty("testCases");
  });

  it("019/US2-1 teclado: entrada, saída, visibilidade, mover, remover e adicionar na ordem do Tab", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await user.selectOptions(within(form()).getByLabelText(/^Tipo/), "Exercício de código");
    await addCase(user, "", "");
    await addCase(user, "", "");
    const first = within(testCase(1));
    (document.activeElement as HTMLElement | null)?.blur();
    await expectTabOrder(user, [
      first.getByLabelText(/^Entrada do caso 1/),
      first.getByLabelText(/^Saída esperada do caso 1/),
      first.getByRole("radio", { name: "Público — o aluno vê e pode executar" }),
      first.getByRole("button", { name: /^Mover para baixo/ }),
      first.getByRole("button", { name: /^Remover/ }),
      within(testCase(2)).getByLabelText(/^Entrada do caso 2/),
      within(section()).getByRole("button", { name: "Adicionar caso" }),
    ]);
  });
});

describe("019/US2 ExerciseDetail — os casos do exercício na página dele", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("019/US2-1 lista cada caso com a visibilidade em palavras e a entrada vazia dita", async () => {
    const exercise = exerciseView({
      type: "CODE",
      expectedAnswer: null,
      instructions: "Leia e dobre.",
      expectedSolution: "print(2)",
      language: { id: JAVA.id, name: "Java", highlight: "java" },
      testCases: [
        { position: 0, input: "1", expectedOutput: "2", visibility: "PUBLIC" },
        { position: 1, input: "", expectedOutput: "0", visibility: "PRIVATE" },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => (String(input) === `/api/exercises/${exercise.id}` ? json(200, exercise) : json(200, [JAVA]))),
    );
    const { container } = renderWithProviders(<ExerciseDetail exerciseId={exercise.id} canEdit={false} />);
    expect(await screen.findByText("Caso 1 — Público")).toBeTruthy();
    expect(screen.getByText("Caso 2 — Privado")).toBeTruthy();
    expect(screen.getByText("Entrada: (vazia)")).toBeTruthy();
    expect(screen.getByText("Saída esperada: 0")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
