import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { generationRequestView, itemId, json, POO, POO_REVISION } from "./test-fixtures";
import { WorkGenerationRequestDetail, WorkGenerationRequestsList } from "./work-generation-requests";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const WORK_ID = "00000000-0000-4000-e000-000000000009";

describe("011/FR-032 pedidos de geração de trabalho", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a lista mostra a situação em palavras (nunca só pela cor), a configuração e o trabalho criado", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        items: [
          generationRequestView({ id: "00000000-0000-4000-f000-000000000011", status: "PENDING" }),
          generationRequestView({ id: "00000000-0000-4000-f000-000000000012", status: "GENERATED", workId: WORK_ID, generatedAt: "2026-09-30T12:01:00.000Z" }),
          generationRequestView({ id: "00000000-0000-4000-f000-000000000013", status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED" }),
        ],
        nextCursor: null,
      }),
    );
    const { container } = renderWithProviders(<WorkGenerationRequestsList />);
    expect(await screen.findAllByRole("heading", { level: 2, name: "Trabalho de herança" })).toHaveLength(3);
    expect(screen.getByText("Gerando")).toBeTruthy();
    expect(screen.getByText("Gerado")).toBeTruthy();
    expect(screen.getByText("Falhou")).toBeTruthy();
    expect(
      screen.getAllByText(`${POO.name} · Intermediário · 5 questões (Pergunta e resposta 3 · Múltipla escolha 2) · 1 pegadinha · nota 2,00`),
    ).toHaveLength(3);
    expect(screen.getAllByText("Tópicos: Herança, Polimorfismo")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Abrir trabalho" }).getAttribute("href")).toBe(`/trabalhos/${WORK_ID}`);
    // "Pedir de novo" only once the generation ended.
    expect(screen.getAllByRole("button", { name: "Pedir de novo" })).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it("sem pedidos: estado vazio com Criar trabalho com IA", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [], nextCursor: null }));
    renderWithProviders(<WorkGenerationRequestsList />);
    expect(await screen.findByText("Nenhum pedido de geração")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Criar trabalho com IA" }).getAttribute("href")).toBe("/trabalhos/gerar");
  });

  it("GENERATED: o pedido leva ao trabalho em rascunho", async () => {
    fetchMock.mockResolvedValue(json(200, generationRequestView({ status: "GENERATED", workId: WORK_ID })));
    const { container } = renderWithProviders(<WorkGenerationRequestDetail id={generationRequestView().id} />);
    expect((await screen.findByRole("link", { name: "Abrir trabalho para revisar" })).getAttribute("href")).toBe(`/trabalhos/${WORK_ID}`);
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("FAILED: diz que falhou e \"Tentar de novo\" pede a mesma configuração ligada ao pedido original", async () => {
    const failed = generationRequestView({ status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED", description: "Primeiro" });
    const again = generationRequestView({ id: "00000000-0000-4000-f000-000000000099", regeneratedFromId: failed.id });
    const writes: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return json(202, again);
      }
      return json(200, String(input).endsWith(again.id) ? again : failed);
    });
    const { container } = renderWithProviders(<WorkGenerationRequestDetail id={failed.id} />);
    expect(await screen.findByText("A geração falhou e nenhum trabalho foi criado.")).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/trabalhos/pedidos/${again.id}`));
    expect(writes).toEqual([
      {
        subjectId: POO.id,
        syllabusRevisionId: POO_REVISION.id,
        syllabusItemIds: [itemId("Herança"), itemId("Polimorfismo")],
        title: "Trabalho de herança",
        description: "Primeiro",
        difficulty: "INTERMEDIATE",
        totalGrade: "2.00",
        total: 5,
        types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
        distribution: { mode: "AUTO" },
        trickQuestions: 1,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        regeneratedFromId: failed.id,
      },
    ]);
  });

  it("PENDING: avisa que a página se atualiza sozinha", async () => {
    fetchMock.mockResolvedValue(json(200, generationRequestView()));
    renderWithProviders(<WorkGenerationRequestDetail id={generationRequestView().id} />);
    expect(await screen.findByText(/A IA está preparando o trabalho\./)).toBeTruthy();
  });
});
