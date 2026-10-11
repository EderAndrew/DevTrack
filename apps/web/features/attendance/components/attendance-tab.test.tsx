import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_ID, apiError, CLASS_ID, json, routedFetch } from "@/features/activities/components/test-fixtures";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { AttendanceTab } from "./attendance-tab";
import { ANA, ATTENDANCE_PATH, BRUNO, CAIO, room, student } from "./test-fixtures";

const PATH = ATTENDANCE_PATH;
const EMPTY_ROOM = room([student(ANA, "Ana Souza"), student(BRUNO, "Bruno Lima"), student(CAIO, "Caio Reis")]);

const render = () => renderWithProviders(<AttendanceTab classId={CLASS_ID} activityId={ACTIVITY_ID} />);

describe("016/US1 AttendanceTab — chamada antes da primeira liberação", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("016/US1-2 016/FR-003 Marcar todos, Desmarcar todos e o contador; o diálogo pergunta por n alunos e envia só as diferenças", async () => {
    const released = room([
      student(ANA, "Ana Souza", { markedAt: "2026-10-01T12:05:00.000Z", roomStatus: "PRESENT" }),
      student(BRUNO, "Bruno Lima"),
      student(CAIO, "Caio Reis", { markedAt: "2026-10-01T12:05:00.000Z", roomStatus: "PRESENT" }),
    ]);
    const api = routedFetch({ [`GET ${PATH}`]: json(200, EMPTY_ROOM), [`POST ${PATH}`]: json(200, released) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    expect(await screen.findByText("0 de 3 selecionados")).toBeTruthy();
    const release = screen.getByRole("button", { name: "Liberar para os presentes" });
    expect(release.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Marcar todos" }));
    expect(screen.getByText("3 de 3 selecionados")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Desmarcar todos" }));
    expect(screen.getByText("0 de 3 selecionados")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Marcar todos" }));
    await user.click(screen.getByRole("checkbox", { name: "Bruno Lima" }));
    expect(screen.getByText("2 de 3 selecionados")).toBeTruthy();

    await user.click(release);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Liberar o trabalho para 2 alunos?")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Liberar" }));

    expect(await screen.findByText("2 de 3 presentes")).toBeTruthy();
    expect(api.writes()).toEqual([{ method: "POST", url: PATH, body: { mark: [ANA, CAIO], unmark: [] } }]);
    // After the release the list shows each student's situation in words.
    const list = screen.getByRole("list", { name: "Alunos da turma" });
    expect(within(list).getAllByText("Presente")).toHaveLength(2);
    expect(within(list).getByText("Não marcado")).toBeTruthy();
  });

  it("016/FR-020 depois da liberação a situação de cada aluno aparece por texto: presente, respondendo, fora da sala e entregou", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        [`GET ${PATH}`]: json(
          200,
          room([
            student(ANA, "Ana Souza", { markedAt: "2026-10-01T12:05:00.000Z", roomStatus: "ANSWERING", attemptId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1" }),
            student(BRUNO, "Bruno Lima", { markedAt: "2026-10-01T12:05:00.000Z", roomStatus: "SUBMITTED", attemptId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2" }),
            student(CAIO, "Caio Reis"),
          ]),
        ),
      }).fetch,
    );
    render();
    const list = await screen.findByRole("list", { name: "Alunos da turma" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => [within(item).getByText(/Souza|Lima|Reis/).textContent, item.querySelector("[data-room-status]")?.textContent])).toEqual([
      ["Ana Souza", "Respondendo"],
      ["Bruno Lima", "Entregou"],
      ["Caio Reis", "Não marcado"],
    ]);
    expect(screen.getByText("2 de 3 presentes")).toBeTruthy();
  });

  it("016/FR-023 estados: carregando, vazio, erro e sem conexão", async () => {
    vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: json(200, room([])) }).fetch);
    const empty = render();
    expect(screen.getByText("Carregando a chamada…")).toBeTruthy();
    expect(await screen.findByText("Nenhum aluno matriculado nesta turma.")).toBeTruthy();
    empty.unmount();

    vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: apiError(409, "ATTENDANCE_NOT_REQUIRED", "x") }).fetch);
    const failed = render();
    expect((await screen.findByRole("alert")).textContent).toContain("Tentar novamente");
    failed.unmount();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render();
    expect((await screen.findByRole("alert")).textContent).toMatch(/conex/i);
  });

  it("016/FR-023 axe e teclado: as caixas, Marcar todos e Liberar pelo Tab", async () => {
    vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: json(200, EMPTY_ROOM) }).fetch);
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByText("0 de 3 selecionados");
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Marcar todos" }),
      screen.getByRole("button", { name: "Desmarcar todos" }),
      screen.getByRole("checkbox", { name: "Ana Souza" }),
      screen.getByRole("checkbox", { name: "Caio Reis" }),
    ]);
    screen.getByRole("checkbox", { name: "Ana Souza" }).focus();
    await user.keyboard(" ");
    expect(screen.getByText("1 de 3 selecionados")).toBeTruthy();
  });
});
