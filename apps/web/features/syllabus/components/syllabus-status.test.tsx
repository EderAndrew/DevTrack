import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { SYLLABUS_POLL_MS } from "../hooks/use-syllabus-documents";
import { SyllabusStatus } from "./syllabus-status";
import { documentDetail, documentView, POO_EXTRACTION } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000456";

describe("004/FR-016 004/FR-051 SyllabusStatus — situação do processamento (research E17)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const gets = (id: string) =>
    fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === `/api/syllabus-documents/${id}` && (init?.method ?? "GET") === "GET",
    ).length;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("consulta a cada 2 s enquanto Enviado/Processando e para em Processado; a troca é anunciada (aria-live)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = documentView(SUBJECT_ID);
    const answers = [
      documentDetail(view),
      documentDetail({ ...view, processingStatus: "PROCESSING", attempts: 1 }),
      documentDetail({ ...view, processingStatus: "PROCESSED", extractionResult: "TEXT" }, { extraction: POO_EXTRACTION }),
    ];
    fetchMock.mockImplementation(() => Promise.resolve(json(200, answers[Math.min(gets(view.id) - 1, 2)])));
    const { container } = renderWithProviders(<SyllabusStatus documentId={view.id} subjectId={SUBJECT_ID} canRetry />);

    const live = (await screen.findByText("Situação:")).parentElement!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toContain("Enviado");

    await act(() => vi.advanceTimersByTimeAsync(SYLLABUS_POLL_MS));
    expect(await screen.findByText("Processando")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(SYLLABUS_POLL_MS));
    expect(await screen.findByText("Processado")).toBeTruthy();
    expect(gets(view.id)).toBe(3);

    await act(() => vi.advanceTimersByTimeAsync(SYLLABUS_POLL_MS * 3));
    expect(gets(view.id)).toBe(3);
    await expectNoA11yViolations(container);
  });

  it.each([
    ["UNREADABLE", "arquivo ilegível"],
    ["TIMEOUT", "tempo esgotado"],
    ["INTERNAL", "erro interno"],
  ] as const)("Falhou (%s): \"O processamento falhou: %s.\" com Tentar novamente e Preencher manualmente", async (category, text) => {
    const failed = documentView(SUBJECT_ID, { processingStatus: "FAILED", failureCategory: category, attempts: 3 });
    fetchMock.mockImplementation((input, init) =>
      Promise.resolve(
        init?.method === "POST"
          ? json(202, { ...failed, processingStatus: "UPLOADED", failureCategory: null, attempts: 0 })
          : json(200, documentDetail(gets(failed.id) > 1 ? { ...failed, processingStatus: "UPLOADED" } : failed)),
      ),
    );
    const user = userEvent.setup();
    const onFillManually = vi.fn();
    const { container } = renderWithProviders(
      <SyllabusStatus documentId={failed.id} subjectId={SUBJECT_ID} canRetry onFillManually={onFillManually} />,
    );

    expect(await screen.findByText(`O processamento falhou: ${text}.`)).toBeTruthy();
    expect(screen.getByText("Falhou")).toBeTruthy();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Preencher manualmente" }));
    expect(onFillManually).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      fetchMock.mock.calls.some(([url, init]) => String(url) === `/api/syllabus-documents/${failed.id}/retry` && init?.method === "POST"),
    ).toBe(true);
    expect(await screen.findByText("Enviado")).toBeTruthy();
    expect(screen.queryByText(/O processamento falhou/)).toBeNull();
  });

  it("sem ementas.enviar não oferece Tentar novamente; erro do pedido é anunciado", async () => {
    const failed = documentView(SUBJECT_ID, { processingStatus: "FAILED", failureCategory: "TIMEOUT" });
    fetchMock.mockResolvedValue(json(200, documentDetail(failed)));
    const { unmount } = renderWithProviders(<SyllabusStatus documentId={failed.id} subjectId={SUBJECT_ID} canRetry={false} />);
    expect(await screen.findByText("O processamento falhou: tempo esgotado.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    unmount();

    fetchMock.mockImplementation((input, init) =>
      Promise.resolve(
        init?.method === "POST"
          ? json(429, { statusCode: 429, code: "RATE_LIMITED", message: "x" })
          : json(200, documentDetail(failed)),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<SyllabusStatus documentId={failed.id} subjectId={SUBJECT_ID} canRetry />);
    await user.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Muitas tentativas. Tente novamente mais tarde.");
  });

  it("004/FR-020 Processado sem texto: pede o preenchimento manual", async () => {
    const noText = documentView(SUBJECT_ID, { mediaType: "PNG", processingStatus: "PROCESSED", extractionResult: "NO_TEXT" });
    fetchMock.mockResolvedValue(json(200, documentDetail(noText)));
    renderWithProviders(<SyllabusStatus documentId={noText.id} subjectId={SUBJECT_ID} canRetry onFillManually={() => {}} />);
    expect(
      await screen.findByText("Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preencher manualmente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });
});
