import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ExamGenerationRequestDetail } from "./exam-generation-request";
import { examGenerationView, json } from "./test-fixtures";

describe("018/US7 ExamGenerationRequestDetail — o pedido e o rascunho", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let view = examGenerationView();

  beforeEach(() => {
    view = examGenerationView();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => json(200, view));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("PENDING: mostra a configuração e que a prova está sendo gerada", async () => {
    const { container } = renderWithProviders(<ExamGenerationRequestDetail id={view.id} />);
    expect(await screen.findByText("Gerando a prova…")).toBeTruthy();
    expect(screen.getByText("Herança, Polimorfismo")).toBeTruthy();
    expect(screen.getByText("Pergunta e resposta 2 · Múltipla escolha 2 · Código 1")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("018/FR-006 GENERATED: o rascunho espera a revisão e a aprovação do professor", async () => {
    view = examGenerationView({ status: "GENERATED", generatedAt: "2026-10-13T12:01:00.000Z", examId: "00000000-0000-4000-e000-000000000101" });
    renderWithProviders(<ExamGenerationRequestDetail id={view.id} />);
    expect(await screen.findByText(/O rascunho está pronto\. Revise, edite e aprove a prova/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Revisar rascunho" }).getAttribute("href")).toBe("/provas/00000000-0000-4000-e000-000000000101");
  });

  it("FAILED: explica que nada foi salvo e oferece os dois caminhos", async () => {
    view = examGenerationView({ status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED" });
    renderWithProviders(<ExamGenerationRequestDetail id={view.id} />);
    expect(await screen.findByText(/Não foi possível gerar a prova\. Nada foi salvo\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir de novo" }).getAttribute("href")).toBe("/provas/gerar");
    expect(screen.getByRole("link", { name: "Criar prova manualmente" }).getAttribute("href")).toBe("/provas/nova");
  });
});
