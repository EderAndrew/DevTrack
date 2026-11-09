import { fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import type { MobileExamListItem } from "@repo/contracts";
import { ExamList } from "../features/exam-list/components/exam-list";
import { useExams } from "../features/exam-list/hooks/use-exams";
import { LoginForm } from "../features/mobile-auth/components/login-form";
import { ExamRoomScreen } from "../features/exam-room/components/exam-room-screen";
import { fakeApi, memoryStore, renderApp, teacherMe } from "./render";

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
const exams = { items: [{ activityId: ACTIVITY, classId: CLASS, className: "Turma A", title: "Prova de Java", closesAt: plus(45), muted: false }], serverNow: plus(5) };
const monitor = {
  activityId: ACTIVITY,
  durationMinutes: 30,
  startDeadline: plus(15),
  closesAt: plus(45),
  serverNow: plus(5),
  students: [
    {
      studentUserId: "00000000-0000-4000-8000-000000000101",
      name: "Aluno 1",
      markedAt: T0,
      examStatus: "ANSWERING",
      attemptId: "00000000-0000-4000-8000-000000000201",
      startedAt: T0,
      endsAt: plus(30),
      occurrenceCount: 0,
      openHold: null,
      openPause: null,
      nudge: null,
    },
  ],
};

/** The three screens in the order the router shows them (entrar → provas → sala), with the taps counted. */
function PilotApp({ onTap }: { onTap: () => void }) {
  const [screenName, setScreen] = useState<"entrar" | "provas" | "sala">("entrar");
  const [opened, setOpened] = useState<MobileExamListItem | null>(null);
  if (screenName === "entrar") return <LoginForm onSignedIn={() => setScreen("provas")} />;
  if (screenName === "provas") return <ExamsScreen onOpen={(item) => (onTap(), setOpened(item), setScreen("sala"))} />;
  return <ExamRoomScreen classId={opened!.classId} activityId={opened!.activityId} onOpenStudent={jest.fn()} />;
}

function ExamsScreen({ onOpen }: { onOpen: (item: MobileExamListItem) => void }) {
  const list = useExams();
  return list.data ? <ExamList items={list.data.items} onOpen={onOpen} /> : null;
}

describe("024/SC-007 roteiro do piloto: entrar e abrir a sala da prova em andamento", () => {
  it("024/SC-007 depois do login, a sala da prova abre com menos de três toques", async () => {
    fakeApi({
      "POST /auth/mobile/sessions": { token: "b".repeat(43), expiresAt: "2027-02-05T10:00:00.000Z", user: teacherMe },
      "GET /mobile/exams": exams,
      [`GET /classes/${CLASS}/activities/${ACTIVITY}/exam-monitor`]: monitor,
    });
    let taps = 0;
    await renderApp(<PilotApp onTap={() => (taps += 1)} />, { store: memoryStore() });
    await fireEvent.changeText(screen.getByLabelText("E-mail"), "prof@escola.br");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "Senha-correta-1");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));

    await fireEvent.press(await screen.findByRole("button", { name: /^Prova de Java/ }));
    expect(await screen.findByText("Aluno 1")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Prova de Java" })).toBeOnTheScreen();
    expect(taps).toBeLessThan(3);
  });
});

describe("025/SC-007 roteiro do piloto: da sala aberta, o aviso sai em dois toques", () => {
  it("025/SC-007 sala → sino → confirmar: dois toques e um POST com corpo {}, sem digitar nada", async () => {
    const ready = { ...monitor.students[0]!, occurrenceCount: 2, nudge: { canSend: true, pendingSince: null, sentCount: 0, lastDismissedAt: null } };
    const attemptId = ready.attemptId;
    const sendPath = `POST /classes/${CLASS}/activities/${ACTIVITY}/attempts/${attemptId}/exam-nudges`;
    const api = fakeApi({
      "GET /mobile/exams": exams,
      [`GET /classes/${CLASS}/activities/${ACTIVITY}/exam-monitor`]: { ...monitor, students: [ready] },
      [sendPath]: { nudge: { id: "00000000-0000-4000-8000-000000000901", sentAt: plus(6), dismissedAt: null, status: "PENDING" } },
    });
    await renderApp(<ExamRoomScreen classId={CLASS} activityId={ACTIVITY} onOpenStudent={jest.fn()} />, { store: memoryStore("c".repeat(43)) });
    let taps = 0;
    await fireEvent.press(await screen.findByRole("button", { name: "Enviar aviso para Aluno 1" }));
    taps += 1;
    await fireEvent.press(screen.getByRole("button", { name: "Enviar aviso" }));
    taps += 1;
    expect(taps).toBe(2);
    expect(api.calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([{}]);
  });
});
