import type { AiProposalStatus, AiProposalView, CurriculumExtractionOutput, CurriculumProposalContent, SyllabusDocumentDetail } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { documentDetail, documentView, POO_EXTRACTION, revisionView } from "../../syllabus/components/test-fixtures";
import { apiError, json } from "../../subjects/components/test-fixtures";
import { CurriculumProposalReview } from "./curriculum-proposal-review";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SUBJECT_ID = "00000000-0000-4000-8000-000000000789";
const PROPOSAL_ID = "5b1d7c2e-8a38-4c55-9d0b-2a4f5c0f6b22";
const EXECUTION_ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";
const TEACHER_ID = "7a1d7c2e-8a38-4c55-9d0b-2a4f5c0f6b33";

const extraction = (overrides: Partial<CurriculumExtractionOutput> = {}): CurriculumExtractionOutput => ({
  title: "Programação Orientada a Objetos",
  syllabusText: "Exploração dos princípios da programação orientada a objetos.",
  competencyText: null,
  groups: [
    {
      title: "Fundamentos de POO",
      items: [
        { text: "Conceitos de classes, objetos e métodos", sourceRef: "p3.12" },
        { text: "Encapsulamento, herança e polimorfismo", sourceRef: null },
      ],
    },
    { title: null, items: [{ text: "Princípios SOLID", sourceRef: "par41" }] },
  ],
  warnings: [
    { code: "AMBIGUOUS_STRUCTURE", field: "syllabusText", groupIndex: null },
    { code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null },
    { code: "INCOMPLETE_SECTION", field: "groups", groupIndex: 1 },
  ],
  ...overrides,
});

const itemIdsOf = (value: CurriculumExtractionOutput) => [
  ...(["title", "syllabusText", "competencyText"] as const).filter((field) => value[field] !== null),
  ...value.groups.map((_, index) => `group:${index}`),
];

describe("007/US3 CurriculumProposalReview — revisar a proposta e aplicar à ementa", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const posts = (path: string) =>
    fetchMock.mock.calls
      .filter(([url, init]) => String(url).endsWith(path) && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

  let doc: SyllabusDocumentDetail;
  const documentHref = () => `/disciplinas/${SUBJECT_ID}/ementa/${doc.id}`;
  const applyPath = () => `/api/syllabus-documents/${doc.id}/ai-proposals/${PROPOSAL_ID}/apply`;

  const proposalView = (content: CurriculumProposalContent, status: AiProposalStatus = "READY_FOR_REVIEW"): AiProposalView => ({
    id: PROPOSAL_ID,
    executionId: EXECUTION_ID,
    agent: { key: "curriculum-agent", name: "Curriculum Agent", version: 1 },
    proposalType: "CURRICULUM_EXTRACTION",
    target: { type: "SYLLABUS_DOCUMENT", id: doc.id },
    status,
    nature: "SUGGESTION",
    itemIds: itemIdsOf(content.extraction),
    acceptedItemIds: null,
    expiresAt: "2099-01-01T00:00:00.000Z",
    decidedAt: status === "READY_FOR_REVIEW" ? null : "2026-09-25T13:00:00.000Z",
    decision: status === "READY_FOR_REVIEW" ? null : { nature: "HUMAN_DECISION", byUserId: TEACHER_ID },
    createdAt: "2026-09-25T12:00:00.000Z",
    content,
  });

  const contentOf = (value: CurriculumExtractionOutput, unsupported: CurriculumProposalContent["grounding"]["unsupported"] = []): CurriculumProposalContent => ({
    extraction: value,
    grounding: { unsupported },
    source: { documentId: doc.id, sha256: "a".repeat(64), readerVersion: 1 },
  });

  /** GETs of the proposal and the document; `onPost` answers the writes. */
  const serve = (proposal: AiProposalView, onPost: (url: string, body: Record<string, unknown>) => Response = () => json(500, {})) =>
    fetchMock.mockImplementation(async (url, init) => {
      const path = String(url);
      if (init?.method === "POST") return onPost(path, JSON.parse(String(init.body)) as Record<string, unknown>);
      if (path.endsWith(`/api/ai/proposals/${PROPOSAL_ID}`)) return json(200, proposal);
      if (path.endsWith(`/api/syllabus-documents/${doc.id}`)) return json(200, doc);
      return json(404, { statusCode: 404, code: "NOT_FOUND", message: "x" });
    });

  const render = () => renderWithProviders(<CurriculumProposalReview subjectId={SUBJECT_ID} documentId={doc.id} proposalId={PROPOSAL_ID} />);
  const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
  const applyButton = () => screen.getByRole("button", { name: "Aplicar à ementa" });

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    doc = documentDetail(documentView(SUBJECT_ID, { processingStatus: "PROCESSED", extractionResult: "TEXT", version: 2 }), {
      extraction: POO_EXTRACTION,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("007/US3-1 007/FR-026 documento e proposta lado a lado, aviso de sugestão, avisos junto ao campo com ícone e texto, origem e \"Não identificado\"", async () => {
    serve(proposalView(contentOf(extraction(), [{ field: "item", groupIndex: 0, itemIndex: 1 }])));
    const { container } = render();

    expect(await screen.findByRole("heading", { level: 1, name: "Proposta da IA para a ementa" })).toBeTruthy();
    expect(screen.getByText("Ementa — versão 2 (ementa-poo.pdf)")).toBeTruthy();
    expect(screen.getByRole("status", { name: "" }).textContent).toContain("Pronta para revisão");
    expect(
      screen.getByText("Sugestão gerada por IA a partir do documento. Revise antes de aplicar; você ainda poderá editar e confirmar a ementa depois."),
    ).toBeTruthy();

    // The tabs switch the two panels on narrow screens; both are rendered.
    expect(screen.getByRole("tab", { name: "Documento" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Proposta" }).getAttribute("aria-selected")).toBe("true");
    const documentPanel = screen.getByRole("region", { name: "Documento" });
    expect(within(documentPanel).getByText("Object-Oriented Programming")).toBeTruthy();
    expect(within(documentPanel).getByRole("link", { name: "Baixar original" })).toBeTruthy();

    const proposal = screen.getByRole("region", { name: "Proposta" });
    expect(checkbox("Nome da disciplina").checked).toBe(true);
    expect(checkbox("Ementa").checked).toBe(true);
    expect(checkbox("Fundamentos de POO").checked).toBe(true);
    expect(checkbox("Grupo sem título").checked).toBe(true);
    // Competência was not found: the text says so, without a checkbox (and the warning is not repeated).
    expect(screen.queryByRole("checkbox", { name: "Competência" })).toBeNull();
    expect(within(proposal).getAllByText("Não identificado no documento")).toHaveLength(1);
    expect(within(proposal).queryByText("Não identificado no documento.")).toBeNull();

    const syllabusItem = within(proposal).getByText("Exploração dos princípios da programação orientada a objetos.").closest("li")!;
    const ambiguous = within(syllabusItem).getByText("A estrutura do documento é ambígua neste ponto.");
    expect(ambiguous.querySelector("svg")).toBeTruthy();
    const untitled = checkbox("Grupo sem título").closest("li")!;
    expect(within(untitled).getByText("Esta seção parece incompleta no documento.")).toBeTruthy();

    const unsupportedItem = within(proposal).getByText(/Encapsulamento, herança e polimorfismo/).closest("li")!;
    expect(within(unsupportedItem).getByText("Não encontrado no documento — confira antes de aplicar.")).toBeTruthy();
    const summary = within(proposal).getByRole("link", { name: "1 item sem correspondência no documento" });
    expect(summary.getAttribute("href")).toBe(`#${unsupportedItem.id}`);

    expect(within(proposal).getByText(/Conceitos de classes, objetos e métodos/).textContent).toContain("(origem: página 3)");
    expect(within(proposal).getByText(/Princípios SOLID/).textContent).toContain("(origem: parágrafo 41)");

    await expectNoA11yViolations(container);
  });

  it("007/US3-2 desmarcar campos e grupos; \"Aplicar à ementa\" desabilitado sem nada marcado", async () => {
    serve(proposalView(contentOf(extraction())));
    const user = userEvent.setup();
    render();

    await screen.findByRole("checkbox", { name: "Nome da disciplina" });
    for (const name of ["Nome da disciplina", "Ementa", "Fundamentos de POO"]) await user.click(checkbox(name));
    expect(applyButton().hasAttribute("disabled")).toBe(false);
    await user.click(checkbox("Grupo sem título"));
    expect(applyButton().hasAttribute("disabled")).toBe(true);
    await user.click(checkbox("Ementa"));
    expect(applyButton().hasAttribute("disabled")).toBe(false);
  });

  it("aplicar pede confirmação, envia só os itens marcados e leva ao rascunho", async () => {
    const draft = revisionView(doc.id, [], { source: "AI_ASSISTED", aiProposalId: PROPOSAL_ID });
    const content = contentOf(extraction());
    serve(proposalView(content), () => json(200, { revision: draft, proposal: proposalView(content, "PARTIALLY_APPROVED") }));
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("checkbox", { name: "Grupo sem título" }));
    await user.click(applyButton());
    const dialog = await screen.findByRole("alertdialog", { name: "Aplicar à ementa?" });
    expect(
      within(dialog).getByText("Um rascunho da ementa será criado com os itens marcados. Você poderá editá-lo e deverá confirmá-lo."),
    ).toBeTruthy();
    expect(posts(applyPath())).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Aplicar à ementa" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(documentHref()));
    expect(posts(applyPath())).toEqual([{ acceptedItemIds: ["title", "syllabusText", "group:0"], replaceDraft: false }]);
  });

  it("007/US3-9 rascunho existente: segundo diálogo, \"Substituir rascunho\" reenvia com replaceDraft: true", async () => {
    const draft = revisionView(doc.id, [], { source: "AI_ASSISTED", aiProposalId: PROPOSAL_ID });
    const content = contentOf(extraction());
    serve(proposalView(content), (_url, body) =>
      body.replaceDraft
        ? json(200, { revision: draft, proposal: proposalView(content, "APPROVED") })
        : apiError(409, "REVISION_DRAFT_EXISTS", "Já existe."),
    );
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Aplicar à ementa" }));
    await user.click(within(await screen.findByRole("alertdialog", { name: "Aplicar à ementa?" })).getByRole("button", { name: "Aplicar à ementa" }));
    const replace = await screen.findByRole("alertdialog", { name: "Substituir o rascunho?" });
    expect(within(replace).getByText("Já existe um rascunho desta ementa. Substituí-lo pelo conteúdo da proposta?")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    await user.click(within(replace).getByRole("button", { name: "Substituir rascunho" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(documentHref()));
    expect(posts(applyPath()).map((body) => body.replaceDraft)).toEqual([false, true]);
  });

  it("007/US3-8 a seleção é validada com o schema do rascunho antes do envio; o campo com erro é apontado e focado", async () => {
    // Valid for the agent's output (min 1), refused by the 004 draft (trimmed, min 1).
    const blank = extraction();
    blank.groups[1]!.items[0]!.text = "   ";
    const content = contentOf(blank);
    const draft = revisionView(doc.id, [], { source: "AI_ASSISTED", aiProposalId: PROPOSAL_ID });
    serve(proposalView(content), () => json(200, { revision: draft, proposal: proposalView(content, "PARTIALLY_APPROVED") }));
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Aplicar à ementa" }));
    const group = checkbox("Grupo sem título");
    expect(document.activeElement).toBe(group);
    expectFieldErrorLinked(group);
    expect(screen.getByText("Parte do conteúdo selecionado não pode ser aplicada. Desmarque o campo indicado e tente de novo.")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(posts(applyPath())).toHaveLength(0);

    await user.click(group);
    expect(group.getAttribute("aria-invalid")).toBeNull();
    await user.click(applyButton());
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Aplicar à ementa" }));
    await waitFor(() => expect(posts(applyPath())).toHaveLength(1));
    expect(posts(applyPath())[0]!.acceptedItemIds).toEqual(["title", "syllabusText", "group:0"]);
  });

  it("um erro da API aparece pelo catálogo, e a página continua na proposta", async () => {
    serve(proposalView(contentOf(extraction())), () => apiError(409, "CURRICULUM_SOURCE_CHANGED", "x"));
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Aplicar à ementa" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Aplicar à ementa" }));
    expect((await screen.findByRole("alert")).textContent).toBe("O documento analisado não corresponde mais a esta proposta. Peça uma nova análise.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("007/US3-6 rejeitar pede confirmação, envia REJECT pela 006 e volta ao documento", async () => {
    const content = contentOf(extraction());
    serve(proposalView(content), () => json(200, proposalView(content, "REJECTED")));
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Rejeitar proposta" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Rejeitar a proposta?" });
    expect(posts(`/api/ai/proposals/${PROPOSAL_ID}/decision`)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Rejeitar proposta" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(documentHref()));
    expect(posts(`/api/ai/proposals/${PROPOSAL_ID}/decision`)).toEqual([{ decision: "REJECT" }]);
  });

  it("depois da decisão a página é só leitura, com o status e o link \"Abrir rascunho\"", async () => {
    doc = { ...doc, revisions: [{ id: TEACHER_ID, number: 1, status: "DRAFT", source: "AI_ASSISTED", aiProposalId: PROPOSAL_ID, confirmedAt: null }] };
    serve(proposalView(contentOf(extraction()), "APPROVED"));
    render();

    const link = await screen.findByRole("link", { name: "Abrir rascunho" });
    expect(link.getAttribute("href")).toBe(documentHref());
    expect(screen.getByText("Aprovada")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Aplicar à ementa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rejeitar proposta" })).toBeNull();
    expect(screen.getByText("Programação Orientada a Objetos")).toBeTruthy();
  });

  it("vencida sem a varredura: mostrada como expirada e só leitura", async () => {
    serve({ ...proposalView(contentOf(extraction())), expiresAt: "2020-01-01T00:00:00.000Z" });
    render();

    expect(await screen.findByText("Expirada")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("link", { name: "Abrir rascunho" })).toBeNull();
  });

  it("007/FR-027 conteúdo tipo <script> aparece como texto, e não há editor na página", async () => {
    serve(proposalView(contentOf(extraction({ title: '<script>alert("x")</script>', syllabusText: "<b>negrito</b>" }))));
    const { container } = render();

    expect(await screen.findByText('<script>alert("x")</script>')).toBeTruthy();
    expect(screen.getByText("<b>negrito</b>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("proposta de outro documento ou de outro tipo → não encontrada, sem conteúdo", async () => {
    serve({ ...proposalView(contentOf(extraction())), proposalType: "REFERENCE_ITEMS" });
    render();
    expect((await screen.findByRole("alert")).textContent).toContain("Voltar para a ementa");
    expect(screen.queryByText("Programação Orientada a Objetos")).toBeNull();
  });

  it("teclado: as ações e as caixas na ordem da página, e axe sem violações", async () => {
    serve(proposalView(contentOf(extraction())));
    const user = userEvent.setup();
    const { container } = render();

    await screen.findByRole("checkbox", { name: "Nome da disciplina" });
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Voltar para a ementa" }),
      applyButton(),
      screen.getByRole("button", { name: "Rejeitar proposta" }),
      checkbox("Nome da disciplina"),
      checkbox("Ementa"),
      checkbox("Fundamentos de POO"),
      checkbox("Grupo sem título"),
    ]);
    await expectNoA11yViolations(container);
  });
});
