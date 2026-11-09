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

describe("025/US3 os avisos do professor na linha do tempo do aluno", () => {
  const nudge = (id: number, minute: number, overrides: Record<string, unknown> = {}) => ({
    id: `00000000-0000-4000-8000-00000000040${id}`,
    sentAt: at(minute),
    dismissedAt: null,
    status: "PENDING",
    ...overrides,
  });
  const lines = () => screen.getAllByTestId(/^timeline-/).map((card) => card.props.testID as string);

  it("025/US3-1 cada aviso intercalado por horário entre as ocorrências, com os textos da web", async () => {
    const withNudges = {
      ...timeline,
      events: timeline.events.slice(0, 4),
      holds: [],
      nudges: [nudge(1, 3, { dismissedAt: at(3).replace(":00.000Z", ":30.000Z"), status: "DISMISSED" }), nudge(2, 6)],
    };
    await render(<StudentOccurrences timeline={withNudges as never} />);
    expect(lines()).toEqual(["timeline-occurrence-1", "timeline-occurrence-2", "timeline-nudge-1", "timeline-occurrence-3", "timeline-nudge-2"]);
    expect(screen.getByText(`Aviso do professor enviado — ${formatTime(at(3))}`)).toBeOnTheScreen();
    expect(screen.getByText(`Aviso fechado pelo aluno — ${formatTime(at(3).replace(":00.000Z", ":30.000Z"))}`)).toBeOnTheScreen();
    expect(screen.getByText(`Aviso do professor enviado — ${formatTime(at(6))}`)).toBeOnTheScreen();
    expect(screen.getByText("Aguardando o aluno")).toBeOnTheScreen();
  });

  it("025/US3-4 um aviso diz Não é uma ocorrência em texto e não entra na contagem de 1–3", async () => {
    const withNudges = { ...timeline, events: timeline.events.slice(0, 3), holds: [], nudges: [nudge(1, 2, { status: "UNSEEN" })] };
    await render(<StudentOccurrences timeline={withNudges as never} />);
    expect(screen.getByText("Não é uma ocorrência")).toBeOnTheScreen();
    expect(screen.getByText("Não visto")).toBeOnTheScreen();
    // The occurrences keep their own numbers and warnings: the warning between them counts nothing.
    expect(screen.getByText(`${formatTime(at(3))} — Aviso 2 de 3`)).toBeOnTheScreen();
    expect(screen.queryByText(/Aviso 3 de 3/)).toBeNull();
  });
});
