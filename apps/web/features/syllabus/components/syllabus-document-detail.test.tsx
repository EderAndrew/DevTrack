import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json } from "../../subjects/components/test-fixtures";
import { formatFileSize, SyllabusDocumentDetail } from "./syllabus-document-detail";
import { documentDetail, documentView, POO_EXTRACTION } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000789";
const CLASS_ID = "00000000-0000-4000-9000-000000000789";

describe("004/US2-5 SyllabusDocumentDetail — versão da ementa, original e texto extraído", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os dados, \"Baixar original\" como download e o texto extraído", async () => {
    const view = documentView(SUBJECT_ID, { version: 2, pageCount: 3, processingStatus: "PROCESSED", extractionResult: "TEXT" });
    fetchMock.mockResolvedValue(json(200, documentDetail(view, { extraction: POO_EXTRACTION })));
    const { container } = renderWithProviders(
      <SyllabusDocumentDetail subjectId={SUBJECT_ID} documentId={view.id} canRetry canReview />,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Ementa — versão 2" })).toBeTruthy();
    expect(screen.getByText("ementa-poo.pdf")).toBeTruthy();
    expect(screen.getByText("PDF, 3 páginas")).toBeTruthy();
    expect(screen.getByText("2,9 KB")).toBeTruthy();
    const download = screen.getByRole("link", { name: "Baixar original" });
    expect(download.getAttribute("href")).toBe(`/api/syllabus-documents/${view.id}/file`);
    expect(download.hasAttribute("download")).toBe(true);
    expect(screen.getByRole("link", { name: "Voltar para a disciplina" }).getAttribute("href")).toBe(`/disciplinas/${SUBJECT_ID}`);

    expect(screen.getByRole("heading", { level: 2, name: "Texto extraído" })).toBeTruthy();
    expect(screen.getByText("Object-Oriented Programming")).toBeTruthy();
    expect(screen.getByText("Fundamentos de POO")).toBeTruthy();
    expect(screen.getByText("Princípios SOLID")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("004/FR-020 imagem é mostrada inline; vindo da turma, volta para a turma", async () => {
    const view = documentView(SUBJECT_ID, { mediaType: "PNG", pageCount: null, originalFilename: "foto.png" });
    fetchMock.mockResolvedValue(json(200, documentDetail(view)));
    renderWithProviders(<SyllabusDocumentDetail subjectId={SUBJECT_ID} documentId={view.id} classId={CLASS_ID} canRetry canReview />);

    const image = await screen.findByRole("img", { name: "Ementa enviada: foto.png" });
    expect(image.getAttribute("src")).toBe(`/api/syllabus-documents/${view.id}/file?view=inline`);
    expect(screen.getByRole("link", { name: "Voltar para a turma" }).getAttribute("href")).toBe(`/turmas/${CLASS_ID}/ementa`);
    expect(screen.queryByRole("heading", { name: "Texto extraído" })).toBeNull();
  });

  it("documento de outra disciplina na URL → não encontrado", async () => {
    const view = documentView("00000000-0000-4000-8000-000000000999");
    fetchMock.mockResolvedValue(json(200, documentDetail(view)));
    renderWithProviders(<SyllabusDocumentDetail subjectId={SUBJECT_ID} documentId={view.id} canRetry canReview />);
    expect((await screen.findByRole("alert")).textContent).toContain("Recurso não encontrado.");
  });

  it("tamanho legível", () => {
    expect(formatFileSize(812)).toBe("812 bytes");
    expect(formatFileSize(3012)).toBe("2,9 KB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
  });
});
