import { fireEvent, screen } from "@testing-library/react-native";
import { apiError, fakeApi, memoryStore, renderApp } from "../../../test/render";
import { formatTime } from "../schemas/exam-room";
import { ExamRoomScreen } from "./exam-room-screen";
import { StudentOccurrencesScreen } from "./student-occurrences-screen";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(effect, [effect]);
  },
}));

const CLASS = "00000000-0000-4000-8000-0000000000c1";
const ACTIVITY = "00000000-0000-4000-8000-0000000000a1";
const T0 = "2026-11-09T13:00:00.000Z";
const plus = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Nudge = { canSend: boolean; pendingSince: string | null; sentCount: number; lastDismissedAt: string | null } | null;
const OFF: Nudge = { canSend: false, pendingSince: null, sentCount: 0, lastDismissedAt: null };
const READY: Nudge = { canSend: true, pendingSince: null, sentCount: 0, lastDismissedAt: null };
const PENDING: Nudge = { canSend: false, pendingSince: plus(6), sentCount: 1, lastDismissedAt: null };

const student = (n: number, name: string, nudge: Nudge, occurrenceCount = 2) => ({
  studentUserId: id(100 + n),
  name,
  markedAt: plus(0),
  examStatus: "ANSWERING",
  attemptId: id(200 + n),
  startedAt: plus(1),
  endsAt: plus(31),
  occurrenceCount,
  openHold: null,
  openPause: null,
  nudge,
});
const monitor = (students: unknown[]) => ({ activityId: ACTIVITY, durationMinutes: 30, startDeadline: plus(15), closesAt: plus(45), serverNow: plus(5), students });
const list = { items: [{ activityId: ACTIVITY, classId: CLASS, className: "Turma A", title: "Prova de Java", closesAt: plus(45), muted: false }], serverNow: plus(5) };
const monitorPath = `GET /classes/${CLASS}/activities/${ACTIVITY}/exam-monitor`;
const sendPath = (attemptId: string) => `POST /classes/${CLASS}/activities/${ACTIVITY}/attempts/${attemptId}/exam-nudges`;
const sentNudge = { nudge: { id: id(900), sentAt: plus(6), dismissedAt: null, status: "PENDING" } };

const renderRoom = () => renderApp(<ExamRoomScreen classId={CLASS} activityId={ACTIVITY} onOpenStudent={jest.fn()} />, { store: memoryStore("f".repeat(43)) });

describe("025/US1 o sino do aviso discreto na sala do celular", () => {
  it("025/US1-1 025/US1-2 o sino aparece só para quem o servidor permite, com o nome acessível do aluno", async () => {
    fakeApi({
      [monitorPath]: monitor([student(1, "Ana", READY), student(2, "Bruno", OFF, 1), { ...student(3, "Carla", null), attemptId: null }]),
      "GET /mobile/exams": list,
    });
    await renderRoom();
    expect(await screen.findByRole("button", { name: "Enviar aviso para Ana" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Enviar aviso para Bruno" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enviar aviso para Carla" })).toBeNull();
  });

  it("025/US1-3 confirmar envia {} e a sala relida mostra Aviso enviado — aguardando o aluno, com o sino desabilitado", async () => {
    let sent = false;
    const api = fakeApi({
      [monitorPath]: () => monitor([student(1, "Ana", sent ? PENDING : READY)]),
      "GET /mobile/exams": list,
      [sendPath(id(201))]: () => ((sent = true), sentNudge),
    });
    await renderRoom();
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar aviso para Ana" }));
    expect(screen.getByText("Enviar aviso para Ana?")).toBeOnTheScreen();
    expect(screen.getByText("Só Ana verá o aviso na tela da prova.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Enviar aviso" }));

    expect(await screen.findByText("Aviso enviado — aguardando o aluno")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Enviar aviso para Ana" })).toBeDisabled();
    expect(api.calls.filter((call) => call.method === "POST")).toEqual([{ method: "POST", path: sendPath(id(201)).slice(5), body: {}, anonymous: false }]);
  });

  it("cancelar a confirmação não envia nada", async () => {
    const api = fakeApi({ [monitorPath]: monitor([student(1, "Ana", READY)]), "GET /mobile/exams": list });
    await renderRoom();
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar aviso para Ana" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Enviar aviso para Ana?")).toBeNull();
    expect(api.calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("025/US1-5 depois que o aluno fecha, o sino volta com Último aviso fechado às HH:MM do servidor", async () => {
    const dismissedAt = plus(8);
    fakeApi({ [monitorPath]: monitor([student(1, "Ana", { canSend: true, pendingSince: null, sentCount: 1, lastDismissedAt: dismissedAt })]), "GET /mobile/exams": list });
    await renderRoom();
    expect(await screen.findByRole("button", { name: "Enviar aviso para Ana" })).toBeEnabled();
    expect(screen.getByText(`Último aviso fechado às ${formatTime(dismissedAt)}`)).toBeOnTheScreen();
  });

  it("025/US1-6 uma recusa 409 diz Não é possível enviar o aviso agora. e a sala é lida de novo", async () => {
    let reads = 0;
    fakeApi({
      [monitorPath]: () => (reads++, monitor([student(1, "Ana", READY)])),
      "GET /mobile/exams": list,
      [sendPath(id(201))]: apiError(409, "EXAM_NUDGE_NOT_ALLOWED"),
    });
    await renderRoom();
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar aviso para Ana" }));
    const before = reads;
    await fireEvent.press(screen.getByRole("button", { name: "Enviar aviso" }));
    expect(await screen.findByText("Não é possível enviar o aviso agora.")).toBeOnTheScreen();
    expect(reads).toBeGreaterThan(before);
  });

  it("025/US1-1 no detalhe do aluno o mesmo sino, que segue a sala relida", async () => {
    let sent = false;
    fakeApi({
      [monitorPath]: () => monitor([student(1, "Ana", sent ? PENDING : READY)]),
      [`GET /classes/${CLASS}/activities/${ACTIVITY}/attempts/${id(201)}/integrity`]: {
        events: [],
        intervals: [],
        totals: { screenExits: 0, timeAwaySeconds: 0, fullscreenExits: 0, disconnections: 0, offlineSeconds: 0, clipboardBlocks: 0, typingLimitRejections: 0, fullscreenUnavailable: false, detectionUnavailable: false },
        holds: [],
        nudges: [],
      },
      [sendPath(id(201))]: () => ((sent = true), sentNudge),
    });
    await renderApp(<StudentOccurrencesScreen classId={CLASS} activityId={ACTIVITY} attemptId={id(201)} />, { store: memoryStore("f".repeat(43)) });
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar aviso para Ana" }));
    await fireEvent.press(screen.getByRole("button", { name: "Enviar aviso" }));
    expect(await screen.findByText("Aviso enviado — aguardando o aluno")).toBeOnTheScreen();
  });
});
