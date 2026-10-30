import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_ID, apiError, CLASS_ID, json, routedFetch } from "@/features/activities/components/test-fixtures";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { formatTime } from "@/lib/messages/dates";
import { renderWithProviders } from "../../../test/render";
import { AttendanceTab } from "./attendance-tab";
import { ANA, ATTENDANCE_PATH, BRUNO, CAIO, MARKED_AT, room, student } from "./test-fixtures";

const ATTEMPT = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const DONE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

/** After the first release: Ana present, Bruno answering, Caio not marked. */
const RELEASED = room([
  student(ANA, "Ana Souza", { markedAt: MARKED_AT, roomStatus: "PRESENT" }),
  student(BRUNO, "Bruno Lima", { markedAt: MARKED_AT, roomStatus: "ANSWERING", attemptId: ATTEMPT }),
  student(CAIO, "Caio Reis"),
]);

const render = () => renderWithProviders(<AttendanceTab classId={CLASS_ID} activityId={ACTIVITY_ID} />);
const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("016/US2 RoomPanel — o painel da sala depois da primeira liberação", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("016/US2-2 016/FR-004 \"Marcar presente\" libera na hora: um lote de 1, sem diálogo, e a linha passa a \"Presente\"", async () => {
    const after = room([...RELEASED.students.slice(0, 2), student(CAIO, "Caio Reis", { markedAt: MARKED_AT, roomStatus: "PRESENT" })]);
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, RELEASED), [`POST ${ATTENDANCE_PATH}`]: json(200, after) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Marcar presente Caio Reis" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.writes()).toEqual([{ method: "POST", url: ATTENDANCE_PATH, body: { mark: [CAIO], unmark: [] } }]);
    await waitFor(() => expect(within(rowOf("Caio Reis")).getByText("Presente")).toBeTruthy());
    expect(screen.getByText("3 de 3 presentes")).toBeTruthy();
  });

  it("016/US2-3 \"Desmarcar\" só aparece para quem está \"Presente\" e envia um lote de 1", async () => {
    const withSubmitted = room([...RELEASED.students, student("cccccccc-cccc-4ccc-8ccc-ccccccccccc4", "Dora Melo", { markedAt: MARKED_AT, roomStatus: "SUBMITTED", attemptId: DONE })]);
    const after = room([student(ANA, "Ana Souza"), ...withSubmitted.students.slice(1)]);
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, withSubmitted), [`POST ${ATTENDANCE_PATH}`]: json(200, after) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await screen.findByRole("button", { name: "Desmarcar Ana Souza" });
    expect(screen.getAllByRole("button", { name: /^Desmarcar/ })).toHaveLength(1);
    expect(within(rowOf("Bruno Lima")).queryByRole("button", { name: /Desmarcar/ })).toBeNull();
    expect(within(rowOf("Dora Melo")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Caio Reis")).queryByRole("button", { name: /Desmarcar/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Desmarcar Ana Souza" }));
    expect(api.writes()).toEqual([{ method: "POST", url: ATTENDANCE_PATH, body: { mark: [], unmark: [ANA] } }]);
    await waitFor(() => expect(within(rowOf("Ana Souza")).getByText("Não marcado")).toBeTruthy());
  });

  it("016/US2-4 016/FR-005 desmarcar quem já iniciou (409) mostra \"O aluno já iniciou. Use Pausar aluno.\" e relê a sala", async () => {
    const started = room([student(ANA, "Ana Souza", { markedAt: MARKED_AT, roomStatus: "ANSWERING", attemptId: ATTEMPT }), ...RELEASED.students.slice(1)]);
    let reads = 0;
    const api = routedFetch({
      [`GET ${ATTENDANCE_PATH}`]: () => json(200, (reads += 1) === 1 ? RELEASED : started),
      [`POST ${ATTENDANCE_PATH}`]: apiError(409, "ATTENDANCE_STARTED", "Started."),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Desmarcar Ana Souza" }));
    expect((await screen.findByRole("alert")).textContent).toBe("O aluno já iniciou. Use Pausar aluno.");
    await waitFor(() => expect(within(rowOf("Ana Souza")).getByText("Respondendo")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Desmarcar Ana Souza" })).toBeNull();
  });

  it("016/FR-023 axe e teclado: as ações de cada linha pelo Tab, e Enter marca o atrasado", async () => {
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, RELEASED), [`POST ${ATTENDANCE_PATH}`]: json(200, RELEASED) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole("button", { name: "Marcar presente Caio Reis" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Desmarcar Ana Souza" }),
      screen.getByRole("button", { name: "Pausar aluno Bruno Lima" }),
      screen.getByRole("button", { name: "Marcar presente Caio Reis" }),
    ]);
    await tabTo(user, screen.getByRole("button", { name: "Marcar presente Caio Reis" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.writes()).toEqual([{ method: "POST", url: ATTENDANCE_PATH, body: { mark: [CAIO], unmark: [] } }]));
  });

  it("016/FR-023 sem conexão: a mensagem de conexão aparece e nada muda na linha", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") throw new TypeError("Failed to fetch");
      reads += 1;
      return json(200, RELEASED);
    });
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Marcar presente Caio Reis" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/conex/i);
    expect(within(rowOf("Caio Reis")).getByText("Não marcado")).toBeTruthy();
    expect(reads).toBeGreaterThan(0);
  });
});

describe("016/US3 RoomPanel — quem está fora da sala", () => {
  afterEach(() => vi.unstubAllGlobals());

  const PAUSE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
  const STARTED_AT = "2026-10-01T13:42:00.000Z";
  const RELEASE_PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/pauses/${PAUSE_ID}/release`;
  const openPause = {
    id: PAUSE_ID,
    studentUserId: CAIO,
    initiatedBy: "STUDENT" as const,
    reason: "BATHROOM" as const,
    note: null,
    startedAt: STARTED_AT,
    endedAt: null,
    endedBy: null,
    seconds: 180,
  };
  const OUT = room([
    student(ANA, "Ana Souza", { markedAt: MARKED_AT, roomStatus: "PRESENT" }),
    student(BRUNO, "Bruno Lima", { markedAt: MARKED_AT, roomStatus: "ANSWERING", attemptId: ATTEMPT }),
    student(CAIO, "Caio Reis", { markedAt: MARKED_AT, roomStatus: "OUT_OF_ROOM", attemptId: DONE, openPause }),
  ]);
  const BACK = room([OUT.students[0]!, OUT.students[1]!, student(CAIO, "Caio Reis", { markedAt: MARKED_AT, roomStatus: "ANSWERING", attemptId: DONE })]);

  it("016/US3-4 016/FR-020 \"Fora da sala — <motivo>, desde HH:MM\" com o tempo fora, ordenado primeiro", async () => {
    vi.stubGlobal("fetch", routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, OUT) }).fetch);
    render();
    await screen.findByText(`Fora da sala — Ir ao banheiro, desde ${formatTime(STARTED_AT)}`);
    expect(rowOf("Caio Reis").textContent).toContain("há 3 min");
    const names = within(screen.getByRole("list", { name: "Alunos da turma" }))
      .getAllByRole("listitem")
      .map((item) => item.querySelector("[data-student-name]")?.textContent);
    expect(names).toEqual(["Caio Reis", "Ana Souza", "Bruno Lima"]);
    expect(within(rowOf("Bruno Lima")).queryByRole("button", { name: /Liberar retorno/ })).toBeNull();
  });

  it("016/US3-5 016/FR-014 \"Liberar retorno\" envia a liberação da pausa e a linha volta a \"Respondendo\"", async () => {
    let reads = 0;
    const api = routedFetch({
      [`GET ${ATTENDANCE_PATH}`]: () => json(200, (reads += 1) === 1 ? OUT : BACK),
      [`POST ${RELEASE_PATH}`]: json(200, { ...openPause, endedAt: "2026-10-01T13:50:00.000Z", endedBy: "RELEASE", seconds: 480 }),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Liberar retorno Caio Reis" }));
    expect(api.writes()).toEqual([{ method: "POST", url: RELEASE_PATH, body: {} }]);
    await waitFor(() => expect(within(rowOf("Caio Reis")).getByText("Respondendo")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Liberar retorno Caio Reis" })).toBeNull();
  });

  it("016/FR-023 a recusa (atividade encerrada) aparece por texto; teclado: Tab até \"Liberar retorno\" e Enter", async () => {
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, OUT), [`POST ${RELEASE_PATH}`]: apiError(409, "ACTIVITY_CLOSED", "Encerrada.") });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    const { container } = render();
    const release = await screen.findByRole("button", { name: "Liberar retorno Caio Reis" });
    await expectNoA11yViolations(container);
    await tabTo(user, release);
    await user.keyboard("{Enter}");
    expect((await screen.findByRole("alert")).textContent).toMatch(/encerrada/i);
  });
});

describe("016/US5 RoomPanel — \"Pausar aluno\"", () => {
  afterEach(() => vi.unstubAllGlobals());

  const PAUSE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
  const STARTED_AT = "2026-10-01T13:45:00.000Z";
  const PAUSE_PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/students/${BRUNO}/pause`;
  const teacherPause = {
    id: PAUSE_ID,
    studentUserId: BRUNO,
    initiatedBy: "TEACHER" as const,
    reason: "TEACHER" as const,
    note: null,
    startedAt: STARTED_AT,
    endedAt: null,
    endedBy: null,
    seconds: 0,
  };
  const PAUSED = room([
    RELEASED.students[0]!,
    student(BRUNO, "Bruno Lima", { markedAt: MARKED_AT, roomStatus: "OUT_OF_ROOM", attemptId: ATTEMPT, openPause: teacherPause }),
    RELEASED.students[2]!,
  ]);

  it("016/US5-1 016/FR-016 só quem está \"Respondendo\" tem \"Pausar aluno\"; confirmado, envia a pausa e a linha mostra \"Pausado pelo professor\"", async () => {
    let reads = 0;
    const api = routedFetch({
      [`GET ${ATTENDANCE_PATH}`]: () => json(200, (reads += 1) === 1 ? RELEASED : PAUSED),
      [`POST ${PAUSE_PATH}`]: json(201, teacherPause),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    const pauseBruno = await screen.findByRole("button", { name: "Pausar aluno Bruno Lima" });
    expect(screen.getAllByRole("button", { name: /^Pausar aluno/ })).toHaveLength(1);
    await user.click(pauseBruno);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Pausar Bruno Lima?")).toBeTruthy();
    expect(api.writes()).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Pausar" }));

    expect(api.writes()).toEqual([{ method: "POST", url: PAUSE_PATH, body: {} }]);
    await within(rowOf("Bruno Lima")).findByText(`Fora da sala — Pausado pelo professor, desde ${formatTime(STARTED_AT)}`);
    expect(within(rowOf("Bruno Lima")).getByRole("button", { name: "Liberar retorno Bruno Lima" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausar aluno Bruno Lima" })).toBeNull();
  });

  it("016/FR-016 \"Voltar\" fecha a confirmação sem pausar", async () => {
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, RELEASED) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Pausar aluno Bruno Lima" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.writes()).toEqual([]);
  });

  it("016/US5-3 a recusa (o aluno entregou nesse meio-tempo) aparece por texto e a sala é lida de novo", async () => {
    const submitted = room([RELEASED.students[0]!, student(BRUNO, "Bruno Lima", { markedAt: MARKED_AT, roomStatus: "SUBMITTED", attemptId: ATTEMPT }), RELEASED.students[2]!]);
    let reads = 0;
    const api = routedFetch({
      [`GET ${ATTENDANCE_PATH}`]: () => json(200, (reads += 1) === 1 ? RELEASED : submitted),
      [`POST ${PAUSE_PATH}`]: apiError(409, "ATTEMPT_ALREADY_SUBMITTED", "Submitted."),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Pausar aluno Bruno Lima" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Pausar" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Esta atividade já foi entregue.");
    await waitFor(() => expect(within(rowOf("Bruno Lima")).getByText("Entregou")).toBeTruthy());
  });

  it("016/FR-023 axe e teclado: Tab até \"Pausar aluno\", Enter abre a confirmação com o foco dentro e Enter confirma", async () => {
    const api = routedFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, RELEASED), [`POST ${PAUSE_PATH}`]: json(201, teacherPause) });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    const { container } = render();
    const pause = await screen.findByRole("button", { name: "Pausar aluno Bruno Lima" });
    await expectNoA11yViolations(container);
    await tabTo(user, pause);
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(document.body);
    await tabTo(user, within(dialog).getByRole("button", { name: "Pausar" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.writes()).toEqual([{ method: "POST", url: PAUSE_PATH, body: {} }]));
  });
});
