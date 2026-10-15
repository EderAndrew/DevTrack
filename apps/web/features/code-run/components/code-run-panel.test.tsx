import { CODE_RUN_POLL_MS, type QuestionExecution } from "@repo/contracts";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { apiError, json } from "@/features/student-activities/components/test-fixtures";
import { NO_PUBLIC_CASES, OTHER_QUESTION, QUEUED, RUN_HINT, RUNNER_UNAVAILABLE, RUNNING } from "../schemas/code-run";
import { CodeRunPanel } from "./code-run-panel";
import { ACTIVITY_ID, available, codeRun, OTHER_QUESTION_ID, pendingRun, PUBLIC_CASES, QUESTION_ID, RUN_ID, SOURCE } from "./test-fixtures";

const RUNS = `/api/me/activities/${ACTIVITY_ID}/questions/${QUESTION_ID}/code-runs`;
const LATEST = `${RUNS}/latest`;
const RUN = `/api/me/code-runs/${RUN_ID}`;

type Reply = Response | (() => Response);

/** `fetch` by "METHOD path": a list answers one call each (the last one repeats). */
function setup(routes: Record<string, Reply[]>, execution: QuestionExecution | null = available(), sourceCode = SOURCE) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const queue = routes[`${method} ${url}`];
      if (!queue) return apiError(404, "NOT_FOUND", "x");
      const next = queue.length > 1 ? queue.shift()! : queue[0]!;
      return typeof next === "function" ? next() : next.clone();
    }),
  );
  const view = renderWithProviders(
    <CodeRunPanel activityId={ACTIVITY_ID} questionId={QUESTION_ID} execution={execution} sourceCode={sourceCode} publicTestCases={PUBLIC_CASES} />,
  );
  const user = userEvent.setup({ advanceTimers: (ms) => (vi.isFakeTimers() ? vi.advanceTimersByTime(ms) : undefined) });
  const runGets = () => calls.filter((call) => call.method === "GET" && call.url === RUN).length;
  return { ...view, calls, user, runGets };
}

const runButton = () => screen.findByRole("button", { name: /Executar|Executando/ });

describe("019/US1 \"Executar\" numa questão de Código do exercício", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("019/US1-1 019/SC-008 disponível: o botão, a frase, a convenção, a versão e os limites; axe", async () => {
    const { container } = setup({ [`GET ${LATEST}`]: [json(200, { run: null })] });
    const button = await runButton();
    expect(button.textContent).toBe("Executar");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toBe(RUN_HINT);
    expect(screen.getByText(/Leia da entrada padrão e escreva na saída padrão\./)).toBeTruthy();
    expect(screen.getByText(/Versão: Python 3\.13\./)).toBeTruthy();
    expect(screen.getByText(/até 2 s por caso, 256 MB/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Como a saída é comparada" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("019/US1-2 019/FR-010 Executar: \"Na fila\", \"Executando\" com aria-busy, consulta a cada 1 s e o resumo anunciado", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, calls, runGets } = setup({
      [`GET ${LATEST}`]: [json(200, { run: null })],
      [`POST ${RUNS}`]: [json(202, pendingRun("QUEUED"))],
      [`GET ${RUN}`]: [json(200, pendingRun("RUNNING")), json(200, codeRun())],
    });
    await user.click(await runButton());
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ sourceCode: SOURCE });
    expect(await screen.findByRole("status")).toHaveProperty("textContent", QUEUED);
    const busy = screen.getByRole("button", { name: /Executando…/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");

    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS + 10));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(RUNNING));
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS + 10));
    const summary = await screen.findByText("2 de 2 casos públicos passaram");
    expect(summary.closest("[aria-live='polite']")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(((await runButton()) as HTMLButtonElement).disabled).toBe(false);

    // Final: no more polling.
    const settled = runGets();
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS * 5));
    expect(runGets()).toBe(settled);
  });

  it("019/FR-010 a consulta para enquanto a página está escondida e volta quando ela aparece", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, runGets } = setup({
      [`GET ${LATEST}`]: [json(200, { run: null })],
      [`POST ${RUNS}`]: [json(202, pendingRun("QUEUED"))],
      [`GET ${RUN}`]: [json(200, pendingRun("RUNNING"))],
    });
    await user.click(await runButton());
    await screen.findByText(QUEUED);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    const before = runGets();
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS * 5));
    expect(runGets()).toBe(before);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS * 2 + 10));
    expect(runGets()).toBeGreaterThan(before);
  });

  it("019/US1-9 019/FR-010 ao reabrir a questão, a última execução volta: a pendente continua sendo acompanhada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup({
      [`GET ${LATEST}`]: [json(200, { run: pendingRun("RUNNING") })],
      [`GET ${RUN}`]: [json(200, pendingRun("RUNNING")), json(200, codeRun())],
    });
    expect(await screen.findByText(RUNNING)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS * 2 + 10));
    expect(await screen.findByText("2 de 2 casos públicos passaram")).toBeTruthy();
  });

  it("019/FR-009 a pendente é de outra questão: o aviso, nenhum resultado dela, e Executar volta quando ela termina", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const other = { questionId: OTHER_QUESTION_ID, sourceCode: "outro" };
    const { user } = setup({
      [`GET ${LATEST}`]: [json(200, { run: null })],
      [`POST ${RUNS}`]: [json(200, pendingRun("RUNNING", other))],
      [`GET ${RUN}`]: [json(200, codeRun(other))],
    });
    await user.click(await runButton());
    expect(await screen.findByText(OTHER_QUESTION)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(CODE_RUN_POLL_MS + 10));
    await waitFor(() => expect(screen.queryByText(OTHER_QUESTION)).toBeNull());
    expect(screen.queryByText(/casos públicos passaram/)).toBeNull();
    expect(((await runButton()) as HTMLButtonElement).disabled).toBe(false);
  });

  it("019/FR-015 429: o tempo de espera, sem execução", async () => {
    const limited = () =>
      new Response(JSON.stringify({ statusCode: 429, code: "RATE_LIMITED", message: "x" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "12" },
      });
    const { user } = setup({ [`GET ${LATEST}`]: [json(200, { run: null })], [`POST ${RUNS}`]: [limited] });
    await user.click(await runButton());
    expect(await screen.findByText("Muitas execuções seguidas. Tente de novo em 12 s.")).toBeTruthy();
  });

  it("019/US1-1 indisponível, sem casos públicos, sem execução na linguagem e fora do exercício", async () => {
    const unavailable = setup({}, { status: "UNAVAILABLE", languageVersion: null, convention: "STDIN_STDOUT", limits: null });
    expect(screen.getByText(RUNNER_UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Executar" })).toBeNull();
    unavailable.unmount();
    const noCases = setup({}, { status: "NO_PUBLIC_CASES", languageVersion: null, convention: "STDIN_STDOUT", limits: null });
    expect(screen.getByText(NO_PUBLIC_CASES)).toBeTruthy();
    noCases.unmount();
    const unsupported = setup({}, { status: "NOT_SUPPORTED", languageVersion: null, convention: null, limits: null });
    expect(unsupported.container.textContent).toBe("");
    unsupported.unmount();
    expect(setup({}, null).container.textContent).toBe("");
    // None of these asks the API for runs.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("019/SC-008 tudo pelo teclado: Executar com Enter e cada caso aberto pelo seu botão", async () => {
    const { user, calls } = setup({
      [`GET ${LATEST}`]: [json(200, { run: null })],
      [`POST ${RUNS}`]: [json(202, codeRun())],
    });
    const button = await runButton();
    await tabTo(user, button);
    await user.keyboard("{Enter}");
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    await screen.findByText("2 de 2 casos públicos passaram");
    const first = screen.getByRole("button", { name: /Caso 1/ });
    await tabTo(user, first);
    expect(first.getAttribute("aria-expanded")).toBe("false");
    await user.keyboard("{Enter}");
    expect(first.getAttribute("aria-expanded")).toBe("true");
  });
});
