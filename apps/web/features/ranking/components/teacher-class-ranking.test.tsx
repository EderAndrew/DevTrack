import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { apiError, json, routedFetch } from "../../student-activities/components/test-fixtures";
import { TeacherClassRanking } from "./teacher-class-ranking";
import { CLASS, classRanking, SEVEN } from "./test-fixtures";

const PATH = `GET /api/classes/${CLASS.id}/ranking`;
/** The teacher sees the same rows, none of them theirs. */
const TEACHER_ROWS = SEVEN.map((row) => ({ ...row, isViewer: false }));

const bodyRows = () => screen.getAllByRole("row").slice(1);
const cells = (tr: HTMLElement) => within(tr).getAllByRole("cell").map((cell) => cell.textContent);

describe("013/US5 seção \"Ranking\" da turma do professor", () => {
  afterEach(() => vi.unstubAllGlobals());

  function setup(response: Parameters<typeof routedFetch>[0][string]) {
    vi.stubGlobal("fetch", routedFetch({ [PATH]: response }).fetch);
    return { ...renderWithProviders(<TeacherClassRanking classId={CLASS.id} />), user: userEvent.setup() };
  }

  it("013/US5-1 013/FR-022 todas as posições, iguais às dos alunos, sem linha marcada \"Você\"", async () => {
    setup(json(200, classRanking(TEACHER_ROWS)));
    expect(await screen.findByRole("heading", { level: 2, name: "Ranking" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Ranking da turma POO Noturno" })).toBeTruthy();
    expect(bodyRows().map(cells)).toEqual([
      ["1º", "Ana Lima", "105"],
      ["2º", "Bruno Alves", "60"],
      ["2º", "Carla Dias", "60"],
      ["4º", "Davi Rocha", "45"],
      ["5º", "Elisa Melo", "30"],
      ["6º", "Fábio Nunes", "0"],
      ["6º", "Gabi Souza", "0"],
    ]);
    expect(screen.queryByText("Você")).toBeNull();
  });

  it("013/US5-2 turma de outro professor: a mensagem de não encontrado, sem tabela", async () => {
    setup(apiError(404, "NOT_FOUND", "Não encontrado."));
    expect(await screen.findByText("Recurso não encontrado.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("013/US5 erro de carga com \"Tentar novamente\"", async () => {
    let fail = true;
    const { user } = setup(() => (fail ? apiError(500, "INTERNAL_ERROR", "Erro.") : json(200, classRanking(TEACHER_ROWS))));
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    expect(screen.queryByRole("table")).toBeNull();
    fail = false;
    await user.click(retry);
    expect(await screen.findByRole("table")).toBeTruthy();
  });

  it("013/US5 SC-012 sem violações de acessibilidade", async () => {
    const { container } = setup(json(200, classRanking(TEACHER_ROWS)));
    await screen.findByRole("table");
    await expectNoA11yViolations(container);
  });

  it("013/US5 SC-012 no erro, Tab chega a \"Tentar novamente\"", async () => {
    const { container, user } = setup(apiError(500, "INTERNAL_ERROR", "Erro."));
    const retry = await screen.findByRole("button", { name: "Tentar novamente" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [retry]);
  });
});
