import type { AiExecutionStatus, AiExecutionView, CurriculumAiStatus } from "@repo/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { AI_POLL_MS } from "../../ai/hooks/use-ai-execution";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { CurriculumAiPanel } from "./curriculum-ai-panel";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000789";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000123";
const EXECUTION_ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const PROPOSAL_ID = "5b1d7c2e-8a38-4c55-9d0b-2a4f5c0f6b22";

const execution = (status: AiExecutionStatus, extra: Partial<AiExecutionView> = {}): AiExecutionView => ({
  id: EXECUTION_ID,
  agent: { key: "curriculum-agent", name: "Curriculum Agent", version: 1 },
  status,
  riskLevel: "L2_PROPOSAL",
  resource: { type: "SYLLABUS_DOCUMENT", id: DOCUMENT_ID },
  errorCode: null,
  cancelRequested: false,
  proposalId: null,
  createdAt: "2026-09-25T12:00:00.000Z",
  startedAt: null,
  completedAt: null,
  failedAt: null,
  durationMs: null,
  transitions: [],
  ...extra,
});

const status = (extra: Partial<CurriculumAiStatus> = {}): CurriculumAiStatus => ({
  availability: "AVAILABLE",
  activeExecution: null,
  lastExecution: null,
  lastOutcome: null,
  pendingProposalId: null,
  ...extra,
});

const running = (value: AiExecutionStatus, extra: Partial<AiExecutionView> = {}) => {
  const view = execution(value, extra);
  return status({ activeExecution: view, lastExecution: view });
};

describe("007/US1 CurriculumAiPanel — preencher a ementa com IA", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls = (method: string, path: string) =>
    fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(path) && (init?.method ?? "GET") === method);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const render = (onFillManually?: () => void) =>
    renderWithProviders(<CurriculumAiPanel subjectId={SUBJECT_ID} documentId={DOCUMENT_ID} onFillManually={onFillManually} />);

  it("007/US1-5 mostra os textos de FR-041 e o botão \"Preencher com IA\", com axe e teclado", async () => {
    fetchMock.mockResolvedValue(json(200, status()));
    const { container } = render();

    const button = await screen.findByRole("button", { name: "Preencher com IA" });
    expect(screen.getByRole("heading", { level: 2, name: "Preencher com IA" })).toBeTruthy();
    expect(
      screen.getByText("A IA irá analisar o documento e sugerir o preenchimento. Revise as informações antes de aplicá-las."),
    ).toBeTruthy();
    expect(screen.getByText("O conteúdo do documento será enviado a um provedor de IA externo.")).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]![0])).toContain(`/api/syllabus-documents/${DOCUMENT_ID}/ai`);

    await expectTabOrder(userEvent.setup(), [button]);
    await expectNoA11yViolations(container);
  });

  it("007/US1-2 007/FR-018 cada etapa com o seu texto numa região polite, consultando até o estado final", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock
      .mockResolvedValueOnce(json(200, status()))
      .mockResolvedValueOnce(json(202, { execution: execution("QUEUED"), created: true }))
      .mockResolvedValueOnce(json(200, running("QUEUED")))
      .mockResolvedValueOnce(json(200, running("RUNNING")))
      .mockResolvedValueOnce(json(200, running("VALIDATING_OUTPUT")))
      .mockImplementation(async () => json(200, status({ lastExecution: execution("COMPLETED", { proposalId: PROPOSAL_ID }), lastOutcome: "PROPOSAL", pendingProposalId: PROPOSAL_ID })));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render();

    await user.click(await screen.findByRole("button", { name: "Preencher com IA" }));
    expect(calls("POST", `/api/syllabus-documents/${DOCUMENT_ID}/ai-analyses`)).toHaveLength(1);

    const stage = async (text: string) => {
      const region = await screen.findByText(text);
      expect(region.closest("[aria-live='polite']")).not.toBeNull();
    };
    await stage("A análise está aguardando processamento.");
    await expectNoA11yViolations(container);
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS));
    await stage("Analisando a ementa...");
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS));
    await stage("Validando as informações encontradas...");
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS));
    await screen.findByText("Proposta pronta para revisão.");

    const polled = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS * 3));
    expect(fetchMock.mock.calls.length).toBe(polled);
  });

  it("007/US1-4 durante a execução o botão de pedir some, então não há segundo pedido", async () => {
    fetchMock.mockResolvedValue(json(200, running("RUNNING")));
    render();

    await screen.findByText("Analisando a ementa...");
    expect(screen.queryByRole("button", { name: "Preencher com IA" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar análise" })).toBeTruthy();
    expect(calls("POST", `/api/syllabus-documents/${DOCUMENT_ID}/ai-analyses`)).toHaveLength(0);
  });

  it("007/US1-4 o botão fica desabilitado enquanto o pedido está em curso (clique duplo)", async () => {
    let answer: (value: Response) => void = () => {};
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => (answer = resolve));
      return json(200, status());
    });
    const user = userEvent.setup();
    render();

    const button = await screen.findByRole("button", { name: "Preencher com IA" });
    await user.dblClick(button);
    expect(calls("POST", `/api/syllabus-documents/${DOCUMENT_ID}/ai-analyses`)).toHaveLength(1);
    answer(json(202, { execution: execution("QUEUED"), created: true }));
  });

  it("007/FR-019 \"Cancelar análise\" pede confirmação e usa o cancelamento da 006", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") return json(200, execution("CANCELLED"));
      return json(200, running("QUEUED"));
    });
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Cancelar análise" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("A análise será interrompida e nada será alterado na ementa.")).toBeTruthy();
    expect(calls("POST", `/api/ai/executions/${EXECUTION_ID}/cancel`)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar análise" }));
    await waitFor(() => expect(calls("POST", `/api/ai/executions/${EXECUTION_ID}/cancel`)).toHaveLength(1));
  });

  it("pendingProposalId → \"Proposta pronta para revisão.\" e o link \"Revisar proposta\"", async () => {
    fetchMock.mockResolvedValue(json(200, status({ lastOutcome: "PROPOSAL", pendingProposalId: PROPOSAL_ID })));
    const { container } = render();

    expect(await screen.findByText("Proposta pronta para revisão.")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Revisar proposta" });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${SUBJECT_ID}/ementa/${DOCUMENT_ID}/proposta/${PROPOSAL_ID}`);
    expect(screen.queryByRole("button", { name: "Preencher com IA" })).toBeNull();
    await expectTabOrder(userEvent.setup(), [link]);
    await expectNoA11yViolations(container);
  });

  it("429 no pedido → \"Muitas análises solicitadas. Tente novamente em alguns minutos.\"", async () => {
    fetchMock.mockImplementation(async (url, init) =>
      init?.method === "POST" ? apiError(429, "RATE_LIMITED", "x") : json(200, status()),
    );
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Preencher com IA" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Muitas análises solicitadas. Tente novamente em alguns minutos.");
  });

  it("007/FR-040 indisponível → botão desabilitado com a razão ligada por aria-describedby", async () => {
    fetchMock.mockResolvedValue(json(200, status({ availability: "DOCUMENT_WITHOUT_TEXT" })));
    const { container } = render();

    const button = await screen.findByRole("button", { name: "Preencher com IA" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(
      "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente.",
    );
    await expectNoA11yViolations(container);
  });

  describe("007/US2-2 007/FR-040 IA indisponível: a razão aparece e o preenchimento manual continua", () => {
    it.each(["AGENT_DISABLED", "MODEL_UNAVAILABLE", "PAUSED"] as const)("%s → botão desabilitado com a razão, \"Preencher manualmente\" habilitado", async (availability) => {
      fetchMock.mockResolvedValue(json(200, status({ availability })));
      const onFillManually = vi.fn();
      const user = userEvent.setup();
      const { container } = render(onFillManually);

      const button = await screen.findByRole("button", { name: "Preencher com IA" });
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
        "O preenchimento com IA está indisponível no momento.",
      );
      const manual = screen.getByRole("button", { name: "Preencher manualmente" });
      expect((manual as HTMLButtonElement).disabled).toBe(false);
      await user.click(manual);
      expect(onFillManually).toHaveBeenCalledOnce();
      await expectTabOrder(user, [manual]);
      await expectNoA11yViolations(container);
    });

    it("007/US1-7 documento sem texto: a razão SYLLABUS_NOT_READY_FOR_AI, e o manual fica com a situação do documento", async () => {
      fetchMock.mockResolvedValue(json(200, status({ availability: "DOCUMENT_WITHOUT_TEXT" })));
      render(() => {});
      const button = await screen.findByRole("button", { name: "Preencher com IA" });
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
        "O preenchimento com IA precisa de um documento com texto (PDF com texto ou DOCX). Preencha o conteúdo manualmente.",
      );
      expect(screen.queryByRole("button", { name: "Preencher manualmente" })).toBeNull();
    });
  });

  describe("007/US2-3 análise que terminou sem proposta", () => {
    it.each([
      ["FAILED", "AI_PROVIDER_ERROR", "Não foi possível analisar a ementa."],
      ["TIMED_OUT", "AI_TIMEOUT", "A análise excedeu o tempo permitido."],
      ["CANCELLED", "AI_EXECUTION_CANCELLED", "A análise foi cancelada."],
    ] as const)("%s → o texto da etapa, o AiErrorState, \"Tentar novamente\" e \"Preencher manualmente\"", async (value, errorCode, text) => {
      fetchMock.mockImplementation(async (_url, init) =>
        init?.method === "POST"
          ? json(202, { execution: execution("QUEUED"), created: true })
          : json(200, status({ lastExecution: execution(value, { errorCode }) })),
      );
      const onFillManually = vi.fn();
      const user = userEvent.setup();
      const { container } = render(onFillManually);

      expect(await screen.findByText(text)).toBeTruthy();
      expect(container.querySelector(`[data-code="${errorCode}"]`)).not.toBeNull();
      expect(container.textContent).not.toMatch(/provider|fake|claude/i);
      expect(screen.queryByRole("button", { name: "Preencher com IA" })).toBeNull();
      await expectNoA11yViolations(container);

      await user.click(screen.getByRole("button", { name: "Preencher manualmente" }));
      expect(onFillManually).toHaveBeenCalledOnce();
      await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await waitFor(() => expect(calls("POST", `/api/syllabus-documents/${DOCUMENT_ID}/ai-analyses`)).toHaveLength(1));
    });

    it("007/FR-017 nada identificado → o aviso e \"Tentar novamente\"", async () => {
      fetchMock.mockResolvedValue(json(200, status({ lastExecution: execution("COMPLETED"), lastOutcome: "NOTHING_FOUND" })));
      const { container } = render(() => {});
      expect(
        await screen.findByText("Não foi possível identificar conteúdo de ementa neste documento. Preencha manualmente."),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Preencher manualmente" })).toBeTruthy();
      await expectNoA11yViolations(container);
    });

    it("\"Tentar novamente\" fica desabilitado, com a razão, quando a IA ficou indisponível", async () => {
      fetchMock.mockResolvedValue(json(200, status({ availability: "PAUSED", lastExecution: execution("FAILED", { errorCode: "AI_PROVIDER_ERROR" }) })));
      render(() => {});
      const retry = await screen.findByRole("button", { name: "Tentar novamente" });
      expect((retry as HTMLButtonElement).disabled).toBe(true);
      expect(document.getElementById(retry.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
        "O preenchimento com IA está indisponível no momento.",
      );
    });
  });
});
