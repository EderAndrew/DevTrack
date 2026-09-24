import type { ClassView } from "@repo/contracts";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { documentView } from "../../syllabus/components/test-fixtures";
import {
  ClassCalendarSection,
  ClassInvitationsSection,
  ClassPlanningSection,
  ClassStudentsSection,
  ClassSyllabusSection,
} from "./class-sections";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const CLASS: ClassView = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Estruturas de Dados",
  code: "ED-1",
  academicYear: 2026,
  period: null,
  description: null,
  status: "ACTIVE",
  activeStudentCount: 0,
  subject: null,
  startsOn: null,
  endsOn: null,
  plannable: false,
  planStatus: null,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};

describe("004/US1-4 seções da turma", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

  /** GET /classes/:id answers `schoolClass`; the students and invitations lists come back empty. */
  function serve(schoolClass: ClassView) {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input) === `/api/classes/${schoolClass.id}` ? json(200, schoolClass) : json(200, { items: [], nextCursor: null }),
      ),
    );
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Alunos e Convites carregam as listas da turma", async () => {
    serve(CLASS);
    const { unmount } = renderWithProviders(<ClassStudentsSection classId={CLASS.id} canRemove />);
    expect(await screen.findByText("Nenhum aluno nesta turma.")).toBeTruthy();
    expect(urls()).toContain(`/api/classes/${CLASS.id}/enrollments?status=ACTIVE`);
    unmount();

    renderWithProviders(<ClassInvitationsSection classId={CLASS.id} canResend canCancel />);
    expect(await screen.findByText("Nenhum convite pendente.")).toBeTruthy();
    expect(urls()).toContain(`/api/classes/${CLASS.id}/invitations?status=PENDING`);
  });

  it("turma sem disciplina ou datas: o que falta preencher e o link para editar", async () => {
    serve(CLASS);
    const { container } = renderWithProviders(
      <ClassPlanningSection classId={CLASS.id} title="Calendário" empty="Nenhuma aula marcada." canEditClass />,
    );
    expect(
      await screen.findByText("Informe a disciplina e as datas de início e término da turma para planejar."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Editar turma" }).getAttribute("href")).toBe(`/turmas/${CLASS.id}/editar`);
    expect(screen.queryByText("Nenhuma aula marcada.")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("sem turmas.editar, ou turma arquivada, não oferece o link", async () => {
    serve({ ...CLASS, status: "ARCHIVED" });
    renderWithProviders(<ClassPlanningSection classId={CLASS.id} title="Ementa" empty="—" canEditClass />);
    await screen.findByText("Informe a disciplina e as datas de início e término da turma para planejar.");
    expect(screen.queryByRole("link", { name: "Editar turma" })).toBeNull();
  });

  it("turma planejável mostra a seção", async () => {
    serve({ ...CLASS, plannable: true });
    renderWithProviders(
      <ClassPlanningSection classId={CLASS.id} title="Calendário" empty="Nenhuma aula marcada." canEditClass />,
    );
    expect(await screen.findByText("Nenhuma aula marcada.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Calendário" })).toBeTruthy();
  });

  it("004/US4 Calendário da turma: encontros do período; turma arquivada fica só para leitura", async () => {
    const planned = { ...CLASS, subject: { id: "33333333-3333-4333-8333-333333333333", name: "POO" }, startsOn: "2027-02-01", endsOn: "2027-06-30", plannable: true };
    const meetings = { items: [{ id: "44444444-4444-4444-8444-444444444444", date: "2027-03-04", number: 1, status: "PLANNED", topicCount: 0 }], total: 1, planRevision: null };
    const answer = (schoolClass: ClassView) =>
      fetchMock.mockImplementation((input) =>
        Promise.resolve(String(input) === `/api/classes/${CLASS.id}` ? json(200, schoolClass) : json(200, meetings)),
      );
    answer(planned);
    const { unmount } = renderWithProviders(<ClassCalendarSection classId={CLASS.id} canEditClass canManage />);

    expect(await screen.findByText("Total de aulas selecionadas: 1")).toBeTruthy();
    expect(urls()).toContain(`/api/classes/${CLASS.id}/meetings`);
    expect(screen.getByRole("heading", { level: 2, name: "Calendário" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar calendário" })).toBeTruthy();
    unmount();

    answer({ ...planned, status: "ARCHIVED", plannable: false });
    const archived = renderWithProviders(<ClassCalendarSection classId={CLASS.id} canEditClass canManage />);
    expect(await screen.findByText("Total de aulas selecionadas: 1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Salvar calendário" })).toBeNull();
    archived.unmount();

    answer(CLASS);
    renderWithProviders(<ClassCalendarSection classId={CLASS.id} canEditClass canManage />);
    expect(await screen.findByText("Informe a disciplina e as datas de início e término da turma para planejar.")).toBeTruthy();
  });

  it("004/US2 004/FR-006 Ementa da turma: versões da disciplina com volta para a turma, e o envio pela disciplina", async () => {
    const subject = { id: "33333333-3333-4333-8333-333333333333", name: "POO" };
    const planned = { ...CLASS, subject, startsOn: "2026-02-02", endsOn: "2026-06-30", plannable: true };
    const version = documentView(subject.id, { originalFilename: "ementa-poo.pdf" });
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input) === `/api/classes/${CLASS.id}`
          ? json(200, planned)
          : String(input) === `/api/subjects/${subject.id}/syllabus-documents`
            ? json(200, { items: [version] })
            : json(404, { statusCode: 404, code: "NOT_FOUND", message: "x" }),
      ),
    );
    const { container } = renderWithProviders(<ClassSyllabusSection classId={CLASS.id} canEditClass canUpload />);

    const link = await screen.findByRole("link", { name: "ementa-poo.pdf" });
    expect(link.getAttribute("href")).toBe(`/disciplinas/${subject.id}/ementa/${version.id}?turma=${CLASS.id}`);
    expect(screen.getByRole("heading", { level: 2, name: "Ementa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar ementa" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("Ementa de turma não planejável pede disciplina e datas; arquivada não oferece envio", async () => {
    serve(CLASS);
    const { unmount } = renderWithProviders(<ClassSyllabusSection classId={CLASS.id} canEditClass canUpload />);
    expect(
      await screen.findByText("Informe a disciplina e as datas de início e término da turma para planejar."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar ementa" })).toBeNull();
    unmount();

    const subject = { id: "33333333-3333-4333-8333-333333333333", name: "POO" };
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input) === `/api/classes/${CLASS.id}`
          ? json(200, { ...CLASS, subject, startsOn: "2026-02-02", endsOn: "2026-06-30", plannable: true, status: "ARCHIVED" })
          : json(200, { items: [] }),
      ),
    );
    renderWithProviders(<ClassSyllabusSection classId={CLASS.id} canEditClass canUpload />);
    expect(await screen.findByText("Nenhuma ementa enviada.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar ementa" })).toBeNull();
  });
});
