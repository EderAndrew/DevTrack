import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { SubjectDetail } from "./subject-detail";
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
  function serve(subject = POO, classes = [TURMA_A, TURMA_B]) {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
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
    const { container } = renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass />);

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
    expect(screen.getByText("Nenhuma ementa enviada.")).toBeTruthy();
    await expectNoA11yViolations(container);
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

describe("004/SC-012 — SubjectDetail só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ordem de tabulação: ações, Nova turma e turmas", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(String(input).startsWith("/api/classes") ? json(200, { items: [TURMA_A], nextCursor: null }) : json(200, POO)),
    );
    renderWithProviders(<SubjectDetail id={POO.id} canEdit canCreateClass />);
    const user = userEvent.setup();
    const turma = await screen.findByRole("link", { name: TURMA_A.name });

    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Editar" }),
      screen.getByRole("button", { name: "Desativar" }),
      screen.getByRole("link", { name: "Nova turma" }),
      turma,
    ]);
  });
});
