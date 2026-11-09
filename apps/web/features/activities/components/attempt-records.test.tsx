import type { IntegrityTimeline, TeacherExamNudge } from "@repo/contracts";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTime } from "@/lib/messages/dates";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { IntegrityRecords } from "./attempt-records";
import { ACTIVITY_ID, ATTEMPT_ID, CLASS_ID, json, routedFetch } from "./test-fixtures";

const STUDENT_ID = "cccccccc-0000-4000-8000-000000000002";
const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/attempts/${ATTEMPT_ID}/integrity`;

const event = (type: IntegrityTimeline["events"][number]["type"], ordinal: number | null, at: string) => ({
  type,
  questionPosition: null,
  recordedAt: at,
  clientOccurredAt: null,
  buffered: false,
  occurrenceOrdinal: ordinal,
  idleSeconds: null,
  studentUserId: STUDENT_ID,
});
const nudge = (id: number, overrides: Partial<TeacherExamNudge>): TeacherExamNudge => ({
  id: `99999999-9999-4999-8999-${String(id).padStart(12, "0")}`,
  sentAt: "2026-10-01T12:00:00.000Z",
  dismissedAt: null,
  status: "PENDING",
  ...overrides,
});
const timeline = (nudges: TeacherExamNudge[]): IntegrityTimeline => ({
  events: [event("SCREEN_LEFT", 1, "2026-10-01T12:02:00.000Z"), event("FULLSCREEN_EXITED", 2, "2026-10-01T12:06:00.000Z"), event("PASTE_BLOCKED", 3, "2026-10-01T12:12:00.000Z")],
  intervals: [],
  totals: {
    screenExits: 1,
    timeAwaySeconds: 0,
    fullscreenExits: 1,
    disconnections: 0,
    offlineSeconds: 0,
    clipboardBlocks: 1,
    typingLimitRejections: 0,
    fullscreenUnavailable: false,
    detectionUnavailable: false,
  },
  holds: [],
  nudges,
});

const render = (body: IntegrityTimeline) => {
  vi.stubGlobal("fetch", routedFetch({ [`GET ${PATH}`]: json(200, body) }).fetch);
  return renderWithProviders(<IntegrityRecords classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} />);
};
const rowTexts = async () => {
  const table = await screen.findByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
};

describe("025/US3 IntegrityRecords — os avisos do professor na linha do tempo da revisão", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("025/US3-1 cada aviso entre as ocorrências, na ordem do tempo, com o envio e o fechamento no horário do servidor", async () => {
    render(
      timeline([
        nudge(1, { sentAt: "2026-10-01T12:07:00.000Z", dismissedAt: "2026-10-01T12:08:00.000Z", status: "DISMISSED" }),
        nudge(2, { sentAt: "2026-10-01T12:13:00.000Z" }),
      ]),
    );
    const rows = await rowTexts();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain("Saiu da tela");
    expect(rows[1]).toContain("Saiu da tela cheia");
    expect(rows[2]).toContain(`Aviso do professor enviado — ${formatTime("2026-10-01T12:07:00.000Z")}`);
    expect(rows[2]).toContain(`Aviso fechado pelo aluno — ${formatTime("2026-10-01T12:08:00.000Z")}`);
    expect(rows[3]).toContain("Colar bloqueado");
    expect(rows[4]).toContain(`Aviso do professor enviado — ${formatTime("2026-10-01T12:13:00.000Z")}`);
    expect(rows[4]).toContain("Aguardando o aluno");
  });

  it("025/US3-3 na revisão depois do fim, um aviso pendente quando a prova terminou é Não visto", async () => {
    render(timeline([nudge(1, { sentAt: "2026-10-01T12:07:00.000Z", status: "UNSEEN" })]));
    const rows = await rowTexts();
    expect(rows[2]).toContain(`Aviso do professor enviado — ${formatTime("2026-10-01T12:07:00.000Z")}`);
    expect(rows[2]).toContain("Não visto");
    expect(rows[2]).not.toContain("Aguardando o aluno");
  });

  it("025/US3-4 cada aviso diz Não é uma ocorrência em texto, não só por cor, e os totais não mudam", async () => {
    const { container } = render(
      timeline([
        nudge(1, { sentAt: "2026-10-01T12:07:00.000Z", dismissedAt: "2026-10-01T12:08:00.000Z", status: "DISMISSED" }),
        nudge(2, { sentAt: "2026-10-01T12:13:00.000Z" }),
      ]),
    );
    await screen.findByRole("table");
    expect(screen.getAllByText("Não é uma ocorrência")).toHaveLength(2);
    expect(screen.queryByText(/ocorrências?:/i)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("025/US3-1 sem avisos a linha do tempo fica como antes", async () => {
    render(timeline([]));
    expect(await rowTexts()).toHaveLength(3);
    expect(screen.queryByText(/Aviso do professor/)).toBeNull();
  });
});
