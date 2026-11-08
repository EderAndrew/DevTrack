import { act, fireEvent, screen } from "@testing-library/react-native";
import { apiError, fakeApi, memoryStore, renderApp } from "../../../test/render";
import { ExamList } from "../../exam-list/components/exam-list";
import { ExamRoomScreen } from "./exam-room-screen";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(effect, [effect]);
  },
}));

const CLASS = "00000000-0000-4000-8000-0000000000c1";
const ACTIVITY = "00000000-0000-4000-8000-0000000000a1";
const T0 = "2026-11-07T13:00:00.000Z";
const plus = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

const monitor = { activityId: ACTIVITY, durationMinutes: 30, startDeadline: plus(15), closesAt: plus(45), serverNow: plus(5), students: [] };
const item = (muted: boolean) => ({ activityId: ACTIVITY, classId: CLASS, className: "Turma A", title: "Prova de Java", closesAt: plus(45), muted });
const list = (muted: boolean) => ({ items: [item(muted)], serverNow: plus(5) });
const monitorPath = `GET /classes/${CLASS}/activities/${ACTIVITY}/exam-monitor`;
const mutePath = `PUT /classes/${CLASS}/activities/${ACTIVITY}/exam-alerts`;

const renderRoom = () => renderApp(<ExamRoomScreen classId={CLASS} activityId={ACTIVITY} onOpenStudent={jest.fn()} />, { store: memoryStore("f".repeat(43)) });

describe("024/US4 o professor silencia os avisos de uma prova no celular", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("o Switch Silenciar avisos desta prova tem papel switch, estado acessível e muda já, antes da resposta", async () => {
    let muted = false;
    let answer: (value: unknown) => void = () => {};
    const api = fakeApi({
      [monitorPath]: monitor,
      "GET /mobile/exams": () => list(muted),
      [mutePath]: (body: unknown) =>
        new Promise((resolve) => {
          answer = (value) => {
            muted = (body as { muted: boolean }).muted;
            resolve(value);
          };
        }),
    });
    await renderRoom();
    const toggle = await screen.findByRole("switch", { name: "Silenciar avisos desta prova" });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("Avisos silenciados")).toBeNull();

    await fireEvent(toggle, "valueChange", true);
    expect(await screen.findByRole("switch", { name: "Ligar avisos desta prova" })).toBeChecked();
    expect(screen.getByText("Avisos silenciados")).toBeOnTheScreen();
    expect(api.calls.filter((call) => call.method === "PUT")).toEqual([
      { method: "PUT", path: mutePath.slice(4), body: { muted: true }, anonymous: false },
    ]);

    await act(async () => answer({ muted: true }));
    expect(screen.getByRole("switch", { name: "Ligar avisos desta prova" })).toBeChecked();
  });

  it("024/US4-3 com a prova silenciada a sala mostra Avisos silenciados e continua se atualizando", async () => {
    let reads = 0;
    fakeApi({ [monitorPath]: () => (reads++, monitor), "GET /mobile/exams": list(true) });
    await renderRoom();
    expect(await screen.findByText("Avisos silenciados")).toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Ligar avisos desta prova" })).toBeChecked();
    const before = reads;
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(reads).toBeGreaterThan(before);
  });

  it("se o servidor recusa, o Switch volta ao estado anterior e diz o motivo", async () => {
    fakeApi({ [monitorPath]: monitor, "GET /mobile/exams": list(false), [mutePath]: apiError(0, "NETWORK_ERROR") });
    await renderRoom();
    const toggle = await screen.findByRole("switch", { name: "Silenciar avisos desta prova" });
    await fireEvent(toggle, "valueChange", true);
    expect(await screen.findByText("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.")).toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Silenciar avisos desta prova" })).not.toBeChecked();
    expect(screen.queryByText("Avisos silenciados")).toBeNull();
  });

  it("024/US4-3 o card da lista mostra o selo Avisos silenciados só na prova silenciada", async () => {
    const other = { ...item(false), activityId: "00000000-0000-4000-8000-0000000000a2", title: "Prova de Python" };
    await renderApp(<ExamList items={[item(true), other]} onOpen={jest.fn()} />);
    expect(screen.getAllByText("Avisos silenciados")).toHaveLength(1);
  });
});
