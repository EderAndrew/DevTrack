import type { ClassView } from "@repo/contracts";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ClassInvitationsSection, ClassPlanningSection, ClassStudentsSection } from "./class-sections";

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
});
