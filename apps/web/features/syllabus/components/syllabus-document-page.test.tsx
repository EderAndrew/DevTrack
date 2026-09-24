import type { SyllabusDocumentDetail as Detail, SyllabusRevisionView } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { classView, json } from "../../subjects/components/test-fixtures";
import { SyllabusDocumentDetail } from "./syllabus-document-detail";
import { documentDetail, documentView, POO_EXTRACTION, revisionView } from "./test-fixtures";

const SUBJECT_ID = "00000000-0000-4000-8000-000000000654";

/**
 * A small fake of the API: the document and its revisions live in `state`; creating a revision
 * opens it as the document's draft, confirming it makes it the confirmed one.
 */
function fakeApi(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, initial: Detail, revisions: SyllabusRevisionView[] = []) {
  const state = { detail: initial, revisions: new Map(revisions.map((revision) => [revision.id, revision])) };
  const created: unknown[] = [];
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method === "GET" && url === `/api/syllabus-documents/${state.detail.id}`) return Promise.resolve(json(200, state.detail));
    const revisionMatch = /^\/api\/syllabus-revisions\/([^/]+)(\/confirm)?$/.exec(url);
    if (revisionMatch) {
      const revision = state.revisions.get(revisionMatch[1]!)!;
      if (method === "POST") {
        const confirmed = { ...revision, status: "CONFIRMED" as const, confirmedAt: "2026-09-23T17:00:00.000Z" };
        state.revisions.set(revision.id, confirmed);
        state.detail = { ...state.detail, draftRevisionId: null, confirmedRevision: { id: revision.id, number: revision.number } };
        return Promise.resolve(json(200, confirmed));
      }
      return Promise.resolve(json(200, revision));
    }
    if (method === "POST" && url === `/api/syllabus-documents/${state.detail.id}/revisions`) {
      created.push(body);
      const groups =
        body.source === "EXTRACTION"
          ? POO_EXTRACTION.groups
          : body.source === "REVISION"
            ? state.revisions.get(body.basedOnRevisionId)!.groups.map((group) => ({ title: group.title, items: group.items.map((item) => item.text) }))
            : [];
      const revision = revisionView(state.detail.id, groups, {
        source: body.source,
        number: state.revisions.size + 1,
        title: body.source === "EXTRACTION" ? POO_EXTRACTION.title : null,
      });
      state.revisions.set(revision.id, revision);
      state.detail = { ...state.detail, draftRevisionId: revision.id };
      return Promise.resolve(json(201, revision));
    }
    return Promise.resolve(json(404, { statusCode: 404, code: "NOT_FOUND", message: "x" }));
  });
  return { state, created };
}

describe("004/US3 página da versão da ementa — revisão ao lado do original", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderPage = (detail: Detail, { canReview = true } = {}) =>
    renderWithProviders(
      <SyllabusDocumentDetail subjectId={SUBJECT_ID} documentId={detail.id} canRetry canReview={canReview} />,
    );

  it("004/US3-4 004/FR-020 sem texto: mensagem, imagem ?view=inline ao lado e \"Preencher manualmente\" abre o formulário vazio", async () => {
    const view = documentView(SUBJECT_ID, {
      mediaType: "PNG",
      originalFilename: "foto.png",
      pageCount: null,
      processingStatus: "PROCESSED",
      extractionResult: "NO_TEXT",
    });
    const { created } = fakeApi(fetchMock, documentDetail(view));
    const user = userEvent.setup();
    const { container } = renderPage(documentDetail(view));

    expect(await screen.findByText("Não foi possível ler o texto deste arquivo. Preencha o conteúdo manualmente.")).toBeTruthy();
    const image = screen.getByRole("img", { name: "Ementa enviada: foto.png" });
    expect(image.getAttribute("src")).toBe(`/api/syllabus-documents/${view.id}/file?view=inline`);
    expect(screen.queryByRole("button", { name: "Revisar conteúdo" })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Preencher manualmente" }));
    expect(await screen.findByRole("form", { name: "Revisão 1 do conteúdo" })).toBeTruthy();
    expect(created).toEqual([{ source: "MANUAL" }]);
    expect(screen.getByText(/Revisão 1 — rascunho\./).parentElement!.textContent).toContain("Preenchido manualmente.");
    // The image stays next to the form, and "Preencher manualmente" is gone.
    expect(screen.getByRole("img", { name: "Ementa enviada: foto.png" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preencher manualmente" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("004/US3-4 falhou: razão em linguagem simples com Tentar novamente e Preencher manualmente", async () => {
    const view = documentView(SUBJECT_ID, { processingStatus: "FAILED", failureCategory: "UNREADABLE", attempts: 3 });
    fakeApi(fetchMock, documentDetail(view));
    renderPage(documentDetail(view));

    expect(await screen.findByText("O processamento falhou: arquivo ilegível.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preencher manualmente" })).toBeTruthy();
    expect(screen.getByText("Nenhum conteúdo revisado.")).toBeTruthy();
  });

  it("004/US3-1 \"Revisar conteúdo\" cria a revisão a partir do texto extraído, ao lado dele; confirmar anuncia \"Conteúdo confirmado.\"", async () => {
    const view = documentView(SUBJECT_ID, { processingStatus: "PROCESSED", extractionResult: "TEXT" });
    const { created } = fakeApi(fetchMock, documentDetail(view, { extraction: POO_EXTRACTION }));
    const user = userEvent.setup();
    renderPage(documentDetail(view));

    await user.click(await screen.findByRole("button", { name: "Revisar conteúdo" }));
    const form = await screen.findByRole("form", { name: "Revisão 1 do conteúdo" });
    expect(created).toEqual([{ source: "EXTRACTION" }]);
    expect((within(form).getByLabelText("Título") as HTMLInputElement).value).toBe("Object-Oriented Programming");
    expect(within(form).getAllByLabelText("Título do grupo")).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: "Texto extraído" })).toBeTruthy();

    await user.click(within(form).getByRole("button", { name: "Confirmar conteúdo" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirmar conteúdo" }));
    expect(await screen.findByText("Conteúdo confirmado.")).toBeTruthy();
    expect(await screen.findByText(/Conteúdo confirmado — revisão 1\./)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("004/US2-1 004/FR-006 vindo de uma turma sem ementa: \"Usar esta ementa na turma <nome>?\" escolhe o conteúdo confirmado", async () => {
    const classId = "00000000-0000-4000-9000-000000000777";
    const view = documentView(SUBJECT_ID, { processingStatus: "PROCESSED", extractionResult: "TEXT" });
    fakeApi(fetchMock, documentDetail(view, { extraction: POO_EXTRACTION }));
    const document = fetchMock.getMockImplementation()!;
    const selected: unknown[] = [];
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === `/api/classes/${classId}`) return Promise.resolve(json(200, classView("POO — Manhã", { id: classId })));
      if (url === `/api/classes/${classId}/plan`) return Promise.resolve(json(200, { plan: null }));
      if (url === `/api/classes/${classId}/plan/syllabus`) {
        selected.push(JSON.parse(String(init!.body)));
        return Promise.resolve(json(200, { id: "00000000-0000-4000-8000-000000000778", classId, topics: [] }));
      }
      return document(input, init);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <SyllabusDocumentDetail subjectId={SUBJECT_ID} documentId={view.id} classId={classId} canRetry canReview />,
    );

    await user.click(await screen.findByRole("button", { name: "Revisar conteúdo" }));
    const form = await screen.findByRole("form", { name: "Revisão 1 do conteúdo" });
    await user.click(within(form).getByRole("button", { name: "Confirmar conteúdo" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirmar conteúdo" }));

    const offer = await screen.findByRole("alertdialog", { name: "Usar esta ementa na turma POO — Manhã?" });
    await user.click(within(offer).getByRole("button", { name: "Usar ementa" }));

    expect(await screen.findByText(/A turma POO — Manhã agora usa esta ementa\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir para o planejamento" }).getAttribute("href")).toBe(
      `/turmas/${classId}/planejamento`,
    );
    // The id of the revision just confirmed, from "/api/syllabus-revisions/<id>/confirm".
    const confirmUrl = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.endsWith("/confirm"))!;
    const revisionId = confirmUrl.split("/")[3];
    expect(selected).toEqual([{ planRevision: null, revisionId }]);
  });

  it("004/US3-6 confirmado somente leitura, com \"Nova revisão\" a partir dele", async () => {
    const confirmed = revisionView(documentView(SUBJECT_ID).id, [{ title: "Fundamentos", items: ["Classes", "Objetos"] }], {
      status: "CONFIRMED",
      source: "MANUAL",
      title: "POO",
      confirmedAt: "2026-09-23T15:30:00.000Z",
    });
    const view = documentView(SUBJECT_ID, {
      id: confirmed.documentId,
      processingStatus: "FAILED",
      failureCategory: "TIMEOUT",
      confirmedRevision: { id: confirmed.id, number: 1 },
    });
    const { created } = fakeApi(fetchMock, documentDetail(view), [confirmed]);
    const user = userEvent.setup();
    const { container } = renderPage(documentDetail(view));

    expect(await screen.findByText(/Conteúdo confirmado — revisão 1\./)).toBeTruthy();
    expect(screen.getByText(/Preenchido manualmente\./)).toBeTruthy();
    expect(screen.getByText("Classes")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    // With confirmed content, the failure no longer offers "Preencher manualmente".
    expect(screen.queryByRole("button", { name: "Preencher manualmente" })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Nova revisão" }));
    const form = await screen.findByRole("form", { name: "Revisão 2 do conteúdo" });
    expect(created).toEqual([{ source: "REVISION", basedOnRevisionId: confirmed.id }]);
    expect(within(form).getAllByLabelText(/^Item \d+ do grupo 1$/).map((element) => (element as HTMLInputElement).value)).toEqual([
      "Classes",
      "Objetos",
    ]);
  });

  it("sem ementas.revisar: o rascunho aparece só para leitura e nada pode ser iniciado", async () => {
    const draft = revisionView(documentView(SUBJECT_ID).id, [{ title: "G", items: ["Item do rascunho"] }]);
    const view = documentView(SUBJECT_ID, { id: draft.documentId, processingStatus: "PROCESSED", extractionResult: "TEXT", draftRevisionId: draft.id });
    fakeApi(fetchMock, documentDetail(view, { extraction: POO_EXTRACTION }), [draft]);
    renderPage(documentDetail(view), { canReview: false });

    expect(await screen.findByText("Item do rascunho")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByRole("button", { name: /Revisar conteúdo|Nova revisão|Preencher manualmente/ })).toBeNull();
  });

  it("004/FR-018 texto extraído é mostrado como texto, nunca como marcação", async () => {
    const hostile = `<script>window.__pwned = true</script><img src=x onerror="window.__pwned = true">`;
    const view = documentView(SUBJECT_ID, { processingStatus: "PROCESSED", extractionResult: "TEXT" });
    const extraction = { ...POO_EXTRACTION, title: hostile, groups: [{ title: hostile, items: [hostile] }] };
    fakeApi(fetchMock, documentDetail(view, { extraction }));
    const { container } = renderPage(documentDetail(view));

    const section = (await screen.findByRole("heading", { name: "Texto extraído" })).closest("section")!;
    expect(within(section).getAllByText(hostile)).toHaveLength(3);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
