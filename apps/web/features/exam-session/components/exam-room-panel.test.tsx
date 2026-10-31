import type { ExamMonitor, ExamMonitorStudent, IntegrityTimeline, TeacherExamHold, TeacherPause } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_ID, apiError, CLASS_ID, examActivity, json, routedFetch } from "@/features/activities/components/test-fixtures";
import { ActivityDetail } from "@/features/activities/components/activity-detail";
import { formatTime } from "@/lib/messages/dates";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExamRoomPanel } from "./exam-room-panel";

const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const MONITOR_PATH = `${PATH}/exam-monitor`;
const NOW = "2026-10-01T12:20:00.000Z";
const START_DEADLINE = "2026-10-01T12:15:00.000Z";
const HOLD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const ATTEMPT_ID = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const PAUSE_ID = "ffffffff-ffff-4fff-8fff-fffffffffff1";

let sequence = 0;
const studentRow = (name: string, overrides: Partial<ExamMonitorStudent> = {}): ExamMonitorStudent => {
  sequence += 1;
  return {
    studentUserId: `cccccccc-cccc-4ccc-8ccc-${String(sequence).padStart(12, "0")}`,
    name,
    markedAt: "2026-10-01T12:00:00.000Z",
    examStatus: "NOT_MARKED",
    attemptId: null,
    startedAt: null,
    endsAt: null,
    occurrenceCount: 0,
    openHold: null,
    openPause: null,
    ...overrides,
  };
};
const hold = (overrides: Partial<TeacherExamHold> = {}): TeacherExamHold => ({
  id: HOLD_ID,
  attemptId: ATTEMPT_ID,
  occurrenceOrdinal: 4,
  openedAt: "2026-10-01T12:10:00.000Z",
  resolution: null,
  resolvedAt: null,
  canReturn: true,
  ...overrides,
});
const pause: TeacherPause = {
  id: PAUSE_ID,
  studentUserId: "cccccccc-0000-4000-8000-000000000002",
  initiatedBy: "TEACHER",
  reason: "TEACHER",
  note: null,
  startedAt: "2026-10-01T12:12:00.000Z",
  endedAt: null,
  endedBy: null,
  seconds: 480,
};
const held = (overrides: Partial<TeacherExamHold> = {}) =>
  studentRow("Ana Souza", {
    examStatus: "AWAITING_DECISION",
    attemptId: ATTEMPT_ID,
    startedAt: "2026-10-01T12:00:00.000Z",
    endsAt: "2026-10-01T12:30:00.000Z",
    occurrenceCount: 4,
    openHold: hold(overrides),
  });
const monitor = (students: ExamMonitorStudent[]): ExamMonitor => ({
  activityId: ACTIVITY_ID,
  durationMinutes: 30,
  startDeadline: START_DEADLINE,
  closesAt: "2026-10-01T12:45:00.000Z",
  serverNow: NOW,
  students,
});
const decided = (resolution: TeacherExamHold["resolution"]) => hold({ resolution, resolvedAt: NOW, canReturn: false });

const render = (props: { canDecide?: boolean; active?: boolean } = {}) =>
  renderWithProviders(<ExamRoomPanel classId={CLASS_ID} activityId={ACTIVITY_ID} canDecide={props.canDecide ?? true} active={props.active ?? true} />);
const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("018/US5 ExamRoomPanel — a prova em andamento e as decisões do professor", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("018/FR-025 cada situação em palavras, com o tempo e as ocorrências do servidor, e a ação que ela permite", async () => {
    const rows = [
      held(),
      studentRow("Bruno Lima", { examStatus: "PAUSED", attemptId: ATTEMPT_ID, endsAt: "2026-10-01T12:40:00.000Z", openPause: pause }),
      studentRow("Caio Reis", { examStatus: "ANSWERING", attemptId: ATTEMPT_ID, endsAt: "2026-10-01T12:31:30.000Z", occurrenceCount: 1 }),
      studentRow("Dora Melo", { examStatus: "PRESENT" }),
      studentRow("Eva Nunes", { examStatus: "NOT_MARKED", markedAt: null }),
      studentRow("Fábio Dias", { examStatus: "START_CLOSED" }),
      studentRow("Gil Souto", { examStatus: "SUBMITTED", attemptId: ATTEMPT_ID }),
      studentRow("Hana Reis", { examStatus: "TIME_EXPIRED", attemptId: ATTEMPT_ID }),
      studentRow("Ivo Prado", { examStatus: "ENDED_BY_WARNINGS", attemptId: ATTEMPT_ID }),
      studentRow("Júlia Paz", { examStatus: "CANCELLED", attemptId: ATTEMPT_ID }),
    ];
    vi.stubGlobal("fetch", routedFetch({ [`GET ${MONITOR_PATH}`]: json(200, monitor(rows)) }).fetch);
    render();

    const list = await screen.findByRole("list", { name: "Alunos na prova" });
    // The server's order: awaiting a decision first, then paused.
    expect([...list.querySelectorAll("[data-student-name]")].map((el) => el.textContent)).toEqual(
      rows.map((row) => row.name),
    );
    const badge = (name: string) => within(rowOf(name)).getByText((_, element) => element?.hasAttribute("data-exam-status") ?? false).textContent;
    expect(badge("Ana Souza")).toBe("Encerrada por avisos — aguardando decisão");
    expect(badge("Bruno Lima")).toBe(`Pausado — desde ${formatTime(pause.startedAt)} — 20 min restantes`);
    expect(badge("Caio Reis")).toBe("Respondendo — 12 min restantes — 1 ocorrência");
    expect(badge("Dora Melo")).toBe(`Presente — pode iniciar até ${formatTime(START_DEADLINE)}`);
    expect(badge("Eva Nunes")).toBe("Não marcado");
    expect(badge("Fábio Dias")).toBe("Não iniciou (prazo para iniciar encerrado)");
    expect(badge("Gil Souto")).toBe("Entregou");
    expect(badge("Hana Reis")).toBe("Tempo esgotado");
    expect(badge("Ivo Prado")).toBe("Encerrada por avisos — não cancelada");
    expect(badge("Júlia Paz")).toBe("Cancelada — nota zero");

    const actions = (name: string) => within(rowOf(name)).queryAllByRole("button").map((button) => button.textContent);
    expect(actions("Ana Souza")).toEqual(["Ver ocorrências", "Confirmar cancelamento", "Devolver prova"]);
    expect(actions("Bruno Lima")).toEqual(["Liberar retorno"]);
    expect(actions("Caio Reis")).toEqual(["Pausar aluno"]);
    expect(actions("Dora Melo")).toEqual(["Desmarcar"]);
    expect(actions("Eva Nunes")).toEqual(["Marcar presente"]);
    for (const name of ["Fábio Dias", "Gil Souto", "Hana Reis", "Ivo Prado", "Júlia Paz"]) expect(actions(name), name).toEqual([]);
  });

  it("018/US5-1 \"Confirmar cancelamento\" pergunta antes, com a nota zero; \"Voltar\" não envia nada", async () => {
    let reads = 0;
    const api = routedFetch({
      [`GET ${MONITOR_PATH}`]: () => json(200, monitor([(reads += 1) === 1 ? held() : studentRow("Ana Souza", { examStatus: "CANCELLED", attemptId: ATTEMPT_ID })])),
      [`POST ${PATH}/exam-holds/${HOLD_ID}/cancel`]: json(200, decided("CANCEL_CONFIRMED")),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Confirmar cancelamento Ana Souza" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Cancelar a prova de Ana Souza?")).toBeTruthy();
    expect(within(dialog).getByText("A nota será zero. Esta decisão é registrada.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(api.writes()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Confirmar cancelamento Ana Souza" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Confirmar cancelamento" }));
    expect(api.writes()).toEqual([{ method: "POST", url: `${PATH}/exam-holds/${HOLD_ID}/cancel`, body: {} }]);
    await waitFor(() => expect(within(rowOf("Ana Souza")).getByText("Cancelada — nota zero")).toBeTruthy());
  });

  it("018/US5-2 018/FR-022 \"Devolver prova\" só com tempo (canReturn) e sem confirmação", async () => {
    const api = routedFetch({
      [`GET ${MONITOR_PATH}`]: json(200, monitor([held()])),
      [`POST ${PATH}/exam-holds/${HOLD_ID}/return`]: json(200, decided("RETURNED")),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await user.click(await screen.findByRole("button", { name: "Devolver prova Ana Souza" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.writes()).toEqual([{ method: "POST", url: `${PATH}/exam-holds/${HOLD_ID}/return`, body: {} }]);
    expect(screen.queryByRole("button", { name: /Não cancelar/ })).toBeNull();
  });

  it("018/US5-4 018/US5-5 depois do fim só \"Confirmar cancelamento\" e \"Não cancelar\"; uma recusa mostra a mensagem do catálogo", async () => {
    const api = routedFetch({
      [`GET ${MONITOR_PATH}`]: json(200, monitor([held({ canReturn: false })])),
      [`POST ${PATH}/exam-holds/${HOLD_ID}/keep`]: apiError(409, "INVALID_STATE_TRANSITION", "Transição inválida."),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    render();

    await screen.findByRole("button", { name: "Não cancelar Ana Souza" });
    expect(screen.queryByRole("button", { name: /Devolver prova/ })).toBeNull();
    expect(within(rowOf("Ana Souza")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Ver ocorrências",
      "Confirmar cancelamento",
      "Não cancelar",
    ]);
    await user.click(screen.getByRole("button", { name: "Não cancelar Ana Souza" }));
    expect(api.writes()).toEqual([{ method: "POST", url: `${PATH}/exam-holds/${HOLD_ID}/keep`, body: {} }]);
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });

  it("018/FR-021 sem a permissão de decidir, nenhuma decisão aparece; com a prova encerrada, nada de chamada ou pausa", async () => {
    vi.stubGlobal("fetch", routedFetch({ [`GET ${MONITOR_PATH}`]: json(200, monitor([held(), studentRow("Eva Nunes", { markedAt: null })])) }).fetch);
    render({ canDecide: false, active: false });
    await screen.findByText("Ana Souza");
    expect(within(rowOf("Ana Souza")).getAllByRole("button").map((button) => button.textContent)).toEqual(["Ver ocorrências"]);
    expect(within(rowOf("Eva Nunes")).queryAllByRole("button")).toEqual([]);
  });

  it("018/FR-031 \"Ver ocorrências\" lista número, tipo em palavras e horário de cada ocorrência contada", async () => {
    const event = (type: IntegrityTimeline["events"][number]["type"], ordinal: number | null, at: string, idleSeconds: number | null = null) => ({
      type,
      questionPosition: null,
      recordedAt: at,
      clientOccurredAt: null,
      buffered: false,
      occurrenceOrdinal: ordinal,
      idleSeconds,
      studentUserId: "cccccccc-0000-4000-8000-000000000002",
    });
    const timeline: IntegrityTimeline = {
      events: [
        event("SCREEN_LEFT", 1, "2026-10-01T12:02:00.000Z"),
        event("SCREEN_RETURNED", null, "2026-10-01T12:02:10.000Z"),
        event("FULLSCREEN_EXITED", 2, "2026-10-01T12:04:00.000Z"),
        event("PASTE_BLOCKED", 3, "2026-10-01T12:06:00.000Z"),
        event("INACTIVITY", 4, "2026-10-01T12:10:00.000Z", 45),
      ],
      intervals: [],
      totals: {} as IntegrityTimeline["totals"],
      holds: [hold()],
    };
    vi.stubGlobal(
      "fetch",
      routedFetch({ [`GET ${MONITOR_PATH}`]: json(200, monitor([held()])), [`GET ${PATH}/attempts/${ATTEMPT_ID}/integrity`]: json(200, timeline) }).fetch,
    );
    const user = userEvent.setup();
    render();

    const toggle = await screen.findByRole("button", { name: "Ver ocorrências Ana Souza" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    const list = await screen.findByRole("list", { name: "Ocorrências de Ana Souza" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `1. Saiu da tela — ${formatTime("2026-10-01T12:02:00.000Z")}`,
      `2. Saiu da tela cheia — ${formatTime("2026-10-01T12:04:00.000Z")}`,
      `3. Tentou copiar/colar — ${formatTime("2026-10-01T12:06:00.000Z")}`,
      `4. Sem interação por 45 s — ${formatTime("2026-10-01T12:10:00.000Z")}`,
    ]);
    expect(screen.getByRole("button", { name: "Ocultar ocorrências Ana Souza" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("018/SC-011 axe e teclado: as ações da retenção pelo Tab, Enter abre a confirmação e o professor decide só com o teclado", async () => {
    const api = routedFetch({
      [`GET ${MONITOR_PATH}`]: json(200, monitor([held(), studentRow("Caio Reis", { examStatus: "ANSWERING", endsAt: "2026-10-01T12:30:00.000Z" })])),
      [`POST ${PATH}/exam-holds/${HOLD_ID}/cancel`]: json(200, decided("CANCEL_CONFIRMED")),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    const { container } = render();
    await screen.findByRole("button", { name: "Devolver prova Ana Souza" });
    await expectNoA11yViolations(container);
    const button = (name: string) => screen.getByRole("button", { name });
    await expectTabOrder(user, [
      button("Ver ocorrências Ana Souza"),
      button("Confirmar cancelamento Ana Souza"),
      button("Devolver prova Ana Souza"),
      button("Pausar aluno Caio Reis"),
    ]);
    await tabTo(user, button("Confirmar cancelamento Ana Souza"));
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog");
    await tabTo(user, within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.writes()).toEqual([{ method: "POST", url: `${PATH}/exam-holds/${HOLD_ID}/cancel`, body: {} }]));
  });
});

describe("018/FR-024 ActivityDetail — a prova com decisões pendentes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("018/US5-6 \"Liberar resultado\" fica desabilitado com \"n decisões pendentes\"", async () => {
    const pending = examActivity({ exam: { ...examActivity().exam!, pendingDecisions: 2 } });
    vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: json(200, pending), [`GET ${MONITOR_PATH}`]: json(200, monitor([held()])) }).fetch);
    renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply canRelease canTakeAttendance canDecideHolds initialTab="informacoes" />);
    const release = await screen.findByRole("button", { name: /Liberar resultado/ });
    expect(release.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("2 decisões pendentes")).toBeTruthy();
  });

  it("018/FR-022 a prova encerrada continua mostrando a sala com as retenções decidíveis", async () => {
    const closed = examActivity({ status: "CLOSED", exam: { ...examActivity().exam!, pendingDecisions: 1 } });
    vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: json(200, closed), [`GET ${MONITOR_PATH}`]: json(200, monitor([held({ canReturn: false })])) }).fetch);
    renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply canRelease canTakeAttendance canDecideHolds />);
    const section = await screen.findByRole("region", { name: "Chamada e prova" });
    expect(await within(section).findByRole("button", { name: "Não cancelar Ana Souza" })).toBeTruthy();
    expect(screen.getByText("1 decisão pendente")).toBeTruthy();
  });
});
