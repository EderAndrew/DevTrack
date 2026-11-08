import { render, screen } from "@testing-library/react-native";
import { formatTime } from "../schemas/exam-room";
import { StudentOccurrences } from "./student-occurrences";

const at = (minute: number) => `2026-11-07T13:${String(minute).padStart(2, "0")}:00.000Z`;
const event = (type: string, ordinal: number | null, minute: number, idleSeconds: number | null = null) => ({
  type,
  questionPosition: null,
  recordedAt: at(minute),
  clientOccurredAt: null,
  buffered: false,
  occurrenceOrdinal: ordinal,
  idleSeconds,
  studentUserId: "00000000-0000-4000-8000-000000000101",
});

const timeline = {
  events: [
    event("SCREEN_LEFT", 1, 1),
    event("SCREEN_RETURNED", null, 2),
    event("FULLSCREEN_EXITED", 2, 3),
    event("PASTE_BLOCKED", 3, 4),
    event("INACTIVITY", 4, 5, 45),
  ],
  intervals: [],
  totals: { screenExits: 1, fullscreenExits: 1, clipboardBlocks: 1, awaySeconds: 60, typingRefusals: 0 },
  holds: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      attemptId: "00000000-0000-4000-8000-000000000201",
      occurrenceOrdinal: 4,
      openedAt: at(5),
      resolution: null,
      resolvedAt: null,
      canReturn: true,
    },
  ],
};

describe("024/US2-4 as ocorrências de um aluno", () => {
  it("024/US2-4 cada ocorrência em palavras, com o horário do servidor e o aviso a que levou", async () => {
    await render(<StudentOccurrences timeline={timeline as never} />);
    expect(screen.getByText("1. Saiu da tela")).toBeOnTheScreen();
    expect(screen.getByText("2. Saiu da tela cheia")).toBeOnTheScreen();
    expect(screen.getByText("3. Tentou copiar/colar")).toBeOnTheScreen();
    expect(screen.getByText("4. Sem interação por 45 s")).toBeOnTheScreen();
    expect(screen.getByText(`${formatTime(at(1))} — Aviso 1 de 3`)).toBeOnTheScreen();
    expect(screen.getByText(`${formatTime(at(4))} — Aviso 3 de 3`)).toBeOnTheScreen();
    expect(screen.getByText(`${formatTime(at(5))} — Prova retida`)).toBeOnTheScreen();
    // The return to the screen counted nothing: not listed.
    expect(screen.queryByText(/voltou/i)).toBeNull();
  });

  it("sem ocorrência contada, diz isso em palavras", async () => {
    await render(<StudentOccurrences timeline={{ ...timeline, events: [event("SCREEN_RETURNED", null, 2)], holds: [] } as never} />);
    expect(screen.getByText("Nenhuma ocorrência registrada.")).toBeOnTheScreen();
  });
});
