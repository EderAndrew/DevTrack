import { act, screen } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import { apiError, fakeApi, memoryStore, renderApp } from "../../../test/render";
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

const student = (n: number, overrides: Record<string, unknown>) => ({
  studentUserId: `00000000-0000-4000-8000-00000000010${n}`,
  name: `Aluno ${n}`,
  markedAt: T0,
  examStatus: "ANSWERING",
  attemptId: `00000000-0000-4000-8000-00000000020${n}`,
  startedAt: T0,
  endsAt: plus(30),
  occurrenceCount: 0,
  openHold: null,
  openPause: null,
  ...overrides,
});

const hold = {
  id: "00000000-0000-4000-8000-000000000301",
  attemptId: "00000000-0000-4000-8000-000000000201",
  occurrenceOrdinal: 4,
  openedAt: plus(3),
  resolution: null,
  resolvedAt: null,
  canReturn: true,
};

const monitor = (occurrences = 1, serverNow = plus(5)) => ({
  activityId: ACTIVITY,
  durationMinutes: 30,
  startDeadline: plus(15),
  closesAt: plus(45),
  serverNow,
  students: [
    student(1, { examStatus: "AWAITING_DECISION", occurrenceCount: 4, openHold: hold }),
    student(2, { occurrenceCount: occurrences }),
  ],
});

const inProgress = { items: [{ activityId: ACTIVITY, classId: CLASS, className: "Turma A", title: "Prova de Java", closesAt: plus(45), muted: false }], serverNow: plus(5) };
const monitorPath = `GET /classes/${CLASS}/activities/${ACTIVITY}/exam-monitor`;

async function renderRoom() {
  return renderApp(<ExamRoomScreen classId={CLASS} activityId={ACTIVITY} onOpenStudent={jest.fn()} />, { store: memoryStore("f".repeat(43)) });
}

describe("024/US2 a sala da prova no celular", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("024/US2-2 a cada 5 s a sala é lida de novo e a contagem do aluno muda como na web", async () => {
    let reads = 0;
    fakeApi({ [monitorPath]: () => monitor(++reads === 1 ? 1 : 2), "GET /mobile/exams": inProgress });
    await renderRoom();
    expect(await screen.findByText("Respondendo — 25 min restantes — 1 ocorrência")).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText("Respondendo — 25 min restantes — 2 ocorrências")).toBeOnTheScreen();
    expect(screen.getByText("Prova de Java")).toBeOnTheScreen();
    expect(screen.getByText("Turma A")).toBeOnTheScreen();
  });

  it("024/US2-3 a prova retida aparece primeiro, em palavras, com Decida no computador e sem botão de decisão", async () => {
    fakeApi({ [monitorPath]: monitor(), "GET /mobile/exams": inProgress });
    await renderRoom();
    const held = await screen.findByText("Encerrada por avisos — aguardando decisão");
    expect(held).toBeOnTheScreen();
    expect(screen.getByText("Decida no computador")).toBeOnTheScreen();
    const names = screen.getAllByText(/^Aluno \d$/).map((node) => node.props.children);
    expect(names).toEqual(["Aluno 1", "Aluno 2"]);
    for (const decision of ["Confirmar cancelamento", "Devolver prova", "Não cancelar", "Pausar aluno", "Liberar retorno", "Marcar presente"]) {
      expect(screen.queryByText(decision)).toBeNull();
    }
  });

  it("024/US2-5 o tempo restante vem do relógio do servidor, nunca do celular", async () => {
    jest.setSystemTime(new Date(Date.parse(T0) + 3 * 3_600_000));
    fakeApi({ [monitorPath]: monitor(1, plus(5)), "GET /mobile/exams": inProgress });
    await renderRoom();
    expect(await screen.findByText("Respondendo — 25 min restantes — 1 ocorrência")).toBeOnTheScreen();
  });

  it("024/US2-6 uma prova que saiu das provas em andamento mostra Esta prova foi encerrada.", async () => {
    fakeApi({ [monitorPath]: monitor(), "GET /mobile/exams": { items: [], serverNow: plus(5) } });
    await renderRoom();
    expect(await screen.findByText("Esta prova foi encerrada.")).toBeOnTheScreen();
  });

  it("024/US2-7 sem conexão mostra o aviso com o horário da última leitura e volta sozinha quando a conexão volta", async () => {
    let reads = 0;
    fakeApi({
      [monitorPath]: () => {
        reads += 1;
        if (reads === 2) throw apiError(0, "NETWORK_ERROR");
        return monitor();
      },
      "GET /mobile/exams": inProgress,
    });
    await renderRoom();
    expect(await screen.findByText(/^Atualizado às \d{2}:\d{2}:\d{2}$/)).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(await screen.findByText("Sem conexão — os dados podem estar desatualizados")).toBeOnTheScreen();
    expect(screen.getByText(/^Atualizado às/)).toBeOnTheScreen();
    expect(screen.getByText("Aluno 2")).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(screen.queryByText("Sem conexão — os dados podem estar desatualizados")).toBeNull();
  });

  it("024/FR-008 com o app em segundo plano a sala para de ser lida; ao voltar, retoma", async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    let reads = 0;
    fakeApi({ [monitorPath]: () => (reads++, monitor()), "GET /mobile/exams": inProgress });
    await renderRoom();
    await screen.findByText("Aluno 2");
    const before = reads;
    await act(async () => listeners.forEach((listener) => listener("background")));
    await act(() => jest.advanceTimersByTimeAsync(15000));
    expect(reads).toBe(before);
    await act(async () => listeners.forEach((listener) => listener("active")));
    await act(() => jest.advanceTimersByTimeAsync(5000));
    expect(reads).toBeGreaterThan(before);
  });

  it("ids que não são UUID (um link de outro app) não viram pedido à API", async () => {
    const api = fakeApi({ "GET /mobile/exams": inProgress });
    await renderApp(<ExamRoomScreen classId="../../mobile" activityId={ACTIVITY} onOpenStudent={jest.fn()} />, { store: memoryStore("f".repeat(43)) });
    expect(await screen.findByText("Esta prova não está mais disponível.")).toBeOnTheScreen();
    expect(api.calls.filter((call) => call.path.includes("exam-monitor"))).toEqual([]);
  });

  it("024/FR-017 uma sala que não é mais do professor (404) diz isso em palavras", async () => {
    fakeApi({ [monitorPath]: apiError(404, "NOT_FOUND"), "GET /mobile/exams": inProgress });
    await renderRoom();
    expect(await screen.findByText("Esta prova não está mais disponível.")).toBeOnTheScreen();
  });
});
