import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { SubjectDetail } from "./subject-detail";
import type { SyllabusDocumentView } from "@repo/contracts";
import { documentView } from "../../syllabus/components/test-fixtures";
import { apiError, classView, json, subjectView } from "./test-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const POO = subjectView("Programação Orientada a Objetos", { description: "Classes e objetos.", classCount: 2 });
const OFFERING = { subject: { id: POO.id, name: POO.name } };
const TURMA_A = classView("POO — Turma A", {
  ...OFFERING,
  period: "2026.1",
  startsOn: "2026-02-02",
  endsOn: "2026-06-30",
  plannable: true,
  planStatus: "ACTIVE",
});
const TURMA_B = classView("POO — Turma B", { ...OFFERING, period: "2026.2" });

describe("004/US1-3 004/US1-6 SubjectDetail — dados, turmas da disciplina e situação", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`);

  /** Answers the subject and its classes; `subject` is what GET /subjects/:id returns. */
  function serve(subject = POO, classes = [TURMA_A, TURMA_B], documents: SyllabusDocumentView[] = []) {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === `/api/subjects/${subject.id}/syllabus-documents`) return Promise.resolve(json(200, { items: documents }));
      if (url.startsWith("/api/classes?")) return Promise.resolve(json(200, { items: classes, nextCursor: null }));
      if (url === `/api/subjects/${subject.id}/status` && init?.method === "POST") {
        const status = (JSON.parse(String(init.body)) as { status: string }).status;
        return Promise.resolve(json(200, { ...subject, status }));
      }
      if (url === `/api/subjects/${subject.id}`) return Promise.resolve(json(200, subject));
      return Promise.resolve(apiError(404, "NOT_FOUND", "Recurso não encontrado."));
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os dados, as turmas com período, datas e planejamento, e a ementa vazia", async () => {
    serve();
    const { container } = renderWithProviders(
      <SubjectDetail id={POO.id} canEdit canCreateClass canViewSyllabus canUploadSyllabus />,
    );

    expect(await screen.findByRole("heading", { level: 1, name: POO.name })).toBeTruthy();
    expect(screen.getByText("Classes e objetos.")).toBeTruthy();
    expect(screen.getByText("Ativa")).toBeTruthy();

    const turmaA = (await screen.findByRole("link", { name: TURMA_A.name })).closest("tr")!;
    expect(within(turmaA).getByText("2026.1")).toBeTruthy();
    expect(within(turmaA).getByText("02/02/2026")).toBeTruthy();
    expect(within(turmaA).getByText("30/06/2026")).toBeTruthy();
    expect(within(turmaA).getByText("Em andamento")).toBeTruthy();
    const turmaB = screen.getByRole("link", { name: TURMA_B.name }).closest("tr")!;
    expect(within(turmaB).getByText("Não iniciado")).toBeTruthy();
    expect(calls()).toContain(`GET /api/classes?subjectId=${POO.id}`);

    expect(screen.getByRole("link", { name: "Nova turma" }).getAttribute("href")).toBe(`/turmas/nova?disciplina=${POO.id}`);
    expect(screen.getByRole("heading", { level: 2, name: "Ementa" })).toBeTruthy();
    expect(await screen.findByText("Nenhuma ementa enviada.")).toBeTruthy();
    expect(screen.getByLabelText("Arquivo da ementa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar ementa" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("004/US2-6 Ementa lista as versões, a mais recente primeiro, com situação e link", async () => {
    const v2 = documentView(POO.id, { version: 2, originalFilename: "ementa-v2.docx", mediaType: "DOCX", processingStatus: "PROCESSED" });
    const v1 = documentView(POO.id, { version: 1, processingStatus: "FAILED", failureCategory: "UNREADABLE" });
    serve(POO, [], [v2, v1]);
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canViewSyllabus canUploadSyllabus />);

    const rows = (await screen.findByRole("table", { name: "Versões da ementa" })).querySelectorAll("tbody tr");
    expect([...rows].map((row) => row.querySelector("td")?.textContent)).toEqual(["2", "1"]);
    const link = screen.getByRole("link", { name: "ementa-v2.docx" });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${POO.id}/ementa/${v2.id}`);
    expect(within(rows[0] as HTMLElement).getByText("Processado")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Falhou")).toBeTruthy();
  });

  it("sem ementas.visualizar não mostra a Ementa; disciplina inativa não oferece o envio", async () => {
    serve({ ...POO, status: "INACTIVE" });
    const { unmount } = renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canViewSyllabus canUploadSyllabus />);
    expect(await screen.findByText("Nenhuma ementa enviada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar ementa" })).toBeNull();
    unmount();

    fetchMock.mockClear();
    serve();
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass />);
    expect(await screen.findByRole("heading", { level: 1, name: POO.name })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Ementa" })).toBeNull();
    expect(calls()).not.toContain(`GET /api/subjects/${POO.id}/syllabus-documents`);
  });

  it("recém-criada mostra o aviso; sem turmas mostra o vazio", async () => {
    serve(POO, []);
    renderWithProviders(<SubjectDetail id={POO.id} created canEdit canCreateClass />);
    expect((await screen.findByRole("status")).textContent).toBe("Disciplina criada.");
    expect(await screen.findByText("Nenhuma turma ligada a esta disciplina.")).toBeTruthy();
  });

  it("desativa e reativa; desativada não oferece Nova turma", async () => {
    serve();
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    expect(await screen.findByRole("button", { name: "Reativar" })).toBeTruthy();
    expect(screen.getByText("Disciplina desativada.")).toBeTruthy();
    expect(screen.getByText("Inativa")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Nova turma" })).toBeNull();
    expect(calls()).toContain(`POST /api/subjects/${POO.id}/status`);
    expect(JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")![1]!.body))).toEqual({
      status: "INACTIVE",
    });
  });

  it("Editar abre o formulário no lugar; salvar mostra Disciplina salva.", async () => {
    serve();
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(200, POO)));
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Editar" }));
    const form = screen.getByRole("form", { name: "Editar disciplina" });
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(200, { ...POO, description: "Nova" })));
    await user.clear(within(form).getByLabelText("Descrição"));
    await user.type(within(form).getByLabelText("Descrição"), "Nova");
    await user.click(within(form).getByRole("button", { name: "Salvar alterações" }));

    expect((await screen.findByRole("status")).textContent).toBe("Disciplina salva.");
    expect(screen.queryByRole("form", { name: "Editar disciplina" })).toBeNull();
  });

  it("sem permissões não mostra ações; disciplina inexistente mostra o erro", async () => {
    serve();
    const { unmount } = renderWithProviders(<SubjectDetail id={POO.id} canEdit={false} canCreateClass={false} />);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Desativar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Nova turma" })).toBeNull();
    unmount();

    renderWithProviders(<SubjectDetail id={crypto.randomUUID()} canEdit canCreateClass />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});

describe("004/US1-7 004/FR-004 SubjectDetail — vincular turma existente", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const ALGORITMOS = { id: "00000000-0000-4000-8000-00000000abcd", name: "Algoritmos" };
  const SEM_DISCIPLINA = classView("Turma antiga 2025");
  const DE_OUTRA = classView("Algoritmos — Turma C", { subject: ALGORITMOS, startsOn: "2026-02-02", endsOn: "2026-06-30" });

  /** The subject's offerings, every class of the teacher, and the PATCH that links one of them. */
  function serve(patch: () => Response = () => json(200, {})) {
    let linked: string[] = [];
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      const all = [TURMA_A, SEM_DISCIPLINA, DE_OUTRA];
      const offerings = () => all.filter((item) => item.subject?.id === POO.id || linked.includes(item.id));
      if (url.startsWith("/api/classes?subjectId=")) return Promise.resolve(json(200, { items: offerings(), nextCursor: null }));
      if (url === "/api/classes") return Promise.resolve(json(200, { items: all, nextCursor: null }));
      if (url.startsWith("/api/classes/") && init?.method === "PATCH") {
        const response = patch();
        if (response.ok) {
          const id = url.slice("/api/classes/".length);
          linked = [...linked, id];
          const item = all.find((entry) => entry.id === id)!;
          return Promise.resolve(json(200, { ...item, subject: { id: POO.id, name: POO.name } }));
        }
        return Promise.resolve(response);
      }
      if (url === `/api/subjects/${POO.id}`) return Promise.resolve(json(200, POO));
      return Promise.resolve(apiError(404, "NOT_FOUND", "Recurso não encontrado."));
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("004/US1-7 oferece Nova turma e Vincular turma existente; escolher uma turma a liga à disciplina", async () => {
    serve();
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canLinkClass />);
    const user = userEvent.setup();
    expect(await screen.findByRole("link", { name: TURMA_A.name })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Nova turma" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Vincular turma existente" }));
    const dialog = await screen.findByRole("dialog", { name: "Vincular turma existente" });
    const select = within(dialog).getByLabelText("Turma");
    await within(dialog).findByRole("option", { name: SEM_DISCIPLINA.name });
    expect(within(dialog).queryByRole("option", { name: TURMA_A.name })).toBeNull();
    expect(within(dialog).getByRole("option", { name: `${DE_OUTRA.name} (disciplina atual: Algoritmos)` })).toBeTruthy();
    await expectNoA11yViolations(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Vincular turma" }));
    expect(await within(dialog).findByText("Escolha uma turma.", { selector: "p" })).toBeTruthy();
    expect(select.getAttribute("aria-invalid")).toBe("true");

    await user.selectOptions(select, SEM_DISCIPLINA.id);
    await user.click(within(dialog).getByRole("button", { name: "Vincular turma" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      `Turma ${SEM_DISCIPLINA.name} vinculada à disciplina. Informe as datas de início e término da turma para usar ementa, calendário e planejamento.`,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("link", { name: SEM_DISCIPLINA.name })).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(String(patch[0])).toBe(`/api/classes/${SEM_DISCIPLINA.id}`);
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ subjectId: POO.id });
  });

  it("004/FR-004 turma com planejamento em outra disciplina é recusada com a mensagem da API", async () => {
    serve(() => apiError(409, "CLASS_SUBJECT_LOCKED", "locked"));
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canLinkClass />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Vincular turma existente" }));
    const dialog = await screen.findByRole("dialog", { name: "Vincular turma existente" });
    await within(dialog).findByRole("option", { name: SEM_DISCIPLINA.name });
    await user.selectOptions(within(dialog).getByLabelText("Turma"), DE_OUTRA.id);
    await user.click(within(dialog).getByRole("button", { name: "Vincular turma" }));

    expect(await within(dialog).findByText(/A disciplina da turma não pode mais ser trocada/)).toBeTruthy();
  });

  it("sem turmas.editar ou com a disciplina inativa não oferece o vínculo", async () => {
    serve();
    const { unmount } = renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canLinkClass={false} />);
    await screen.findByRole("link", { name: TURMA_A.name });
    expect(screen.queryByRole("button", { name: "Vincular turma existente" })).toBeNull();
    unmount();

    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input).startsWith("/api/classes") ? json(200, { items: [], nextCursor: null }) : json(200, { ...POO, status: "INACTIVE" }),
      ),
    );
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canLinkClass />);
    await screen.findByText("Nenhuma turma ligada a esta disciplina.");
    expect(screen.queryByRole("button", { name: "Vincular turma existente" })).toBeNull();
  });
});

describe("004/SC-012 — SubjectDetail só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação: ações, Nova turma, Vincular turma existente e turmas", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(String(input).startsWith("/api/classes") ? json(200, { items: [TURMA_A], nextCursor: null }) : json(200, POO)),
    );
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass canLinkClass />);
    const user = userEvent.setup();
    const turma = await screen.findByRole("link", { name: TURMA_A.name });

    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Editar" }),
      screen.getByRole("button", { name: "Desativar" }),
      screen.getByRole("link", { name: "Nova turma" }),
      screen.getByRole("button", { name: "Vincular turma existente" }),
      turma,
    ]);
  });
});
