import type { ClassView, CohortDirectoryItem } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { AddClass } from "./add-class";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const apiError = (status: number, code: string, message: string) => json(status, { statusCode: status, code, message });

const BD = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Banco de Dados",
  description: null,
  status: "ACTIVE",
  classCount: 0,
  documentCount: 0,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
};
const REDES = { ...BD, id: "33333333-3333-4333-8333-333333333334", name: "Redes" };

const ADS: CohortDirectoryItem = {
  id: "99999999-9999-4999-8999-999999999991",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "Noturno",
  classes: [{ subjectName: "Redes", teacherName: "Professor Beto" }],
};
const ADS_B: CohortDirectoryItem = { ...ADS, id: "99999999-9999-4999-8999-999999999992", name: "ADS 3NB", code: "ADS-3NB", classes: [] };

const created = (cohort: CohortDirectoryItem): ClassView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: cohort.name,
  code: cohort.code,
  academicYear: cohort.academicYear,
  period: cohort.period,
  description: null,
  status: "ACTIVE",
  activeStudentCount: 0,
  subject: { id: BD.id, name: BD.name },
  startsOn: null,
  endsOn: null,
  plannable: false,
  planStatus: null,
  cohort: { id: cohort.id, name: cohort.name, code: cohort.code, academicYear: cohort.academicYear, period: cohort.period },
  ownStatus: "ACTIVE",
  effectiveStatus: "ACTIVE",
  canChangeStatus: false,
  createdAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
});

/**
 * Serves the active subjects and the directory; `onCreate` answers `POST /classes`. The posts are kept in `posts`.
 */
function serve(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  { cohorts = [ADS, ADS_B], onCreate = () => json(201, created(ADS)) }: { cohorts?: CohortDirectoryItem[]; onCreate?: () => Response } = {},
) {
  const posts: unknown[] = [];
  const searches: string[] = [];
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/subjects")) return Promise.resolve(json(200, { items: [BD, REDES], nextCursor: null }));
    if (url.startsWith("/api/cohort-directory")) {
      searches.push(url);
      return Promise.resolve(json(200, { items: cohorts, nextCursor: null }));
    }
    if (url === "/api/classes" && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return Promise.resolve(onCreate());
    }
    return Promise.resolve(apiError(404, "NOT_FOUND", "Recurso não encontrado."));
  });
  return { posts, searches };
}

describe("027/US3 AddClass — acrescentar disciplina a uma turma", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("027/US3-1 027/US3-2 busca a turma, escolhe turma e disciplina e acrescenta; mostra a mensagem e o link", async () => {
    const { posts, searches } = serve(fetchMock);
    const { container } = renderWithProviders(<AddClass />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Turma (nome ou código)"), " ads ");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    const group = await screen.findByRole("group", { name: "Turma" });
    expect(searches).toEqual(["/api/cohort-directory?q=ads"]);
    expect(within(group).getByText("ADS-3NA · 2026 · Noturno")).toBeTruthy();
    expect(within(group).getByText("Disciplinas: Redes (Professor Beto).")).toBeTruthy();
    expect(within(group).getByText("Ainda sem disciplinas.")).toBeTruthy();
    await expectNoA11yViolations(container);

    await user.click(within(group).getByRole("radio", { name: /ADS 3NA/ }));
    await user.selectOptions(await screen.findByLabelText("Disciplina"), BD.id);
    await user.type(screen.getByLabelText("Data de início"), "2026-08-03");
    await user.type(screen.getByLabelText("Data de término"), "2026-12-11");
    await user.click(screen.getByRole("button", { name: "Acrescentar disciplina" }));

    const status = await screen.findByText("Disciplina acrescentada à turma.");
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(posts).toEqual([{ cohortId: ADS.id, subjectId: BD.id, startsOn: "2026-08-03", endsOn: "2026-12-11" }]);
    expect(screen.getByRole("link", { name: "Abrir Banco de Dados · ADS 3NA" }).getAttribute("href")).toBe(
      "/turmas/11111111-1111-4111-8111-111111111111",
    );
  });

  it("calendário opcional: sem datas vai null nas duas", async () => {
    const { posts } = serve(fetchMock);
    renderWithProviders(<AddClass defaultSubjectId={BD.id} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Turma (nome ou código)"), "ads");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await user.click(await screen.findByRole("radio", { name: /ADS 3NB/ }));
    await vi.waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>("Disciplina").value).toBe(BD.id));
    await user.click(screen.getByRole("button", { name: "Acrescentar disciplina" }));
    await vi.waitFor(() => expect(posts).toEqual([{ cohortId: ADS_B.id, subjectId: BD.id, startsOn: null, endsOn: null }]));
  });

  it("027/US3-6 busca sem resultado: \"Turma não encontrada. Peça ao gestor que a crie.\"", async () => {
    serve(fetchMock, { cohorts: [] });
    renderWithProviders(<AddClass />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Turma (nome ou código)"), "inexistente");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expect((await screen.findByText("Turma não encontrada. Peça ao gestor que a crie.")).getAttribute("role")).toBe("status");
  });

  it("027/US3-3 disciplina já na turma: \"Essa disciplina já está nesta turma.\" junto ao campo", async () => {
    serve(fetchMock, { onCreate: () => apiError(409, "CLASS_SUBJECT_DUPLICATE", "x") });
    renderWithProviders(<AddClass />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Turma (nome ou código)"), "ads");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await user.click(await screen.findByRole("radio", { name: /ADS 3NA/ }));
    await user.selectOptions(await screen.findByLabelText("Disciplina"), BD.id);
    await user.click(screen.getByRole("button", { name: "Acrescentar disciplina" }));

    expect(await screen.findAllByText("Essa disciplina já está nesta turma.")).not.toHaveLength(0);
    expect(screen.getByLabelText("Disciplina").getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Disciplina acrescentada à turma.")).toBeNull();
  });

  it("turma fechada entre a busca e o clique: pede outra turma", async () => {
    const { searches } = serve(fetchMock, { onCreate: () => apiError(409, "COHORT_NOT_ACTIVE", "x") });
    renderWithProviders(<AddClass />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Turma (nome ou código)"), "ads");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    await user.click(await screen.findByRole("radio", { name: /ADS 3NA/ }));
    await user.selectOptions(await screen.findByLabelText("Disciplina"), BD.id);
    await user.click(screen.getByRole("button", { name: "Acrescentar disciplina" }));
    expect(await screen.findAllByText("Esta turma não está mais ativa. Pesquise e escolha outra.")).not.toHaveLength(0);
    await vi.waitFor(() => expect(searches).toHaveLength(2));
  });

  it("sem turma ou sem disciplina: erros no resumo, sem chamar a API", async () => {
    const { posts } = serve(fetchMock);
    renderWithProviders(<AddClass />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Acrescentar disciplina" }));
    expect(await screen.findAllByText("Escolha a turma.")).not.toHaveLength(0);
    expect(screen.getAllByText("Escolha a disciplina.")).not.toHaveLength(0);
    expect(posts).toEqual([]);
  });

  it("027/FR-033 nomes de turma, disciplina e professor com HTML aparecem como texto", async () => {
    serve(fetchMock, {
      cohorts: [{ ...ADS, name: "<b>x</b>", classes: [{ subjectName: "<b>s</b>", teacherName: "<b>p</b>" }] }],
    });
    const { container } = renderWithProviders(<AddClass />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Turma (nome ou código)"), "x");
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));
    expect(await screen.findByText("<b>x</b>")).toBeTruthy();
    expect(screen.getByText("Disciplinas: <b>s</b> (<b>p</b>).")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("027/FR-031 AddClass só com teclado", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pesquisa com Enter e ordem de tabulação até Acrescentar disciplina", async () => {
    serve(fetchMock, { cohorts: [ADS] });
    renderWithProviders(<AddClass />);
    const user = userEvent.setup();
    await tabTo(user, screen.getByLabelText("Turma (nome ou código)"));
    await user.keyboard("ads{Enter}");
    const radio = await screen.findByRole("radio", { name: /ADS 3NA/ });

    await expectTabOrder(user, [
      screen.getByLabelText("Turma (nome ou código)"),
      screen.getByRole("button", { name: "Pesquisar" }),
      radio,
      screen.getByLabelText("Disciplina"),
      screen.getByLabelText("Data de início"),
      screen.getByLabelText("Data de término"),
      screen.getByRole("button", { name: "Acrescentar disciplina" }),
      screen.getByRole("link", { name: "Cancelar" }),
    ]);
  });
});
