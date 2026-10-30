import type { RosterEntry, TeacherAttemptGroup } from "@repo/contracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { formatTime } from "@/lib/messages/dates";
import { ActivityDetail } from "./activity-detail";
import { AttemptReview } from "./attempt-review";
import { ACTIVITY_ID, ATTEMPT_ID, CLASS_ID, gradingActivity, json, OPEN_QUESTION_ID, routedFetch, teacherAttempt } from "./test-fixtures";

// 023/US6 — the teacher sees the group in the roster ("Ana Souza e mais 2 — Em grupo", one line per attempt) and,
// in the attempt, the members, the editing history in words and who saved each answer, with the earlier saves in
// a Collapsible. Facts only: nothing says "fraude", "cola" or "violação".

const PATH = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
const ATTEMPT_PATH = `${PATH}/attempts/${ATTEMPT_ID}`;
const ANA = { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", name: "Ana Souza" };
const BRUNO = { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", name: "Bruno Lima" };
const CARLA = { id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3", name: "Carla Dias" };
const CHOICE_QUESTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PARTICIPANTS = [
  { ...ANA, isLeader: true },
  { ...BRUNO, isLeader: false },
  { ...CARLA, isLeader: false },
];
const at = (minute: number) => `2026-10-05T11:${String(minute).padStart(2, "0")}:00.000Z`;

const FACTS: TeacherAttemptGroup = {
  leaderId: ANA.id,
  members: [
    { ...ANA, joinedAt: at(0), addedById: null },
    { ...BRUNO, joinedAt: at(0), addedById: ANA.id },
    { ...CARLA, joinedAt: at(5), addedById: ANA.id },
  ],
  events: [
    { kind: "EDITING_HANDED", reason: null, actorId: ANA.id, fromId: ANA.id, toId: BRUNO.id, occurredAt: at(12) },
    { kind: "EDITING_RESET", reason: "PAUSED", actorId: null, fromId: BRUNO.id, toId: ANA.id, occurredAt: at(20) },
  ],
  saves: [
    { questionId: CHOICE_QUESTION_ID, entries: [{ studentId: ANA.id, revision: 1, savedAt: at(10) }] },
    {
      questionId: OPEN_QUESTION_ID,
      entries: [
        { studentId: ANA.id, revision: 1, savedAt: at(11) },
        { studentId: ANA.id, revision: 2, savedAt: at(13) },
        { studentId: BRUNO.id, revision: 3, savedAt: at(15) },
      ],
    },
  ],
};

describe("023/US6 o grupo na correção do professor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("023/US6-1 a lista de entregas mostra \"Ana Souza e mais 2 — Em grupo\" numa só linha; quem fez sozinho na sua", async () => {
    const base = gradingActivity();
    const template = base.roster.find((entry) => entry.attemptId === ATTEMPT_ID)!;
    const member = (person: { id: string; name: string }): RosterEntry => ({ ...template, studentUserId: person.id, name: person.name, participants: PARTICIPANTS, group: true });
    const davi: RosterEntry = {
      ...template,
      studentUserId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
      name: "Davi Rocha",
      attemptId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
      participants: [{ id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4", name: "Davi Rocha", isLeader: true }],
    };
    const roster = [member(ANA), member(BRUNO), member(CARLA), davi];
    const api = routedFetch({
      [`GET ${PATH}`]: json(200, gradingActivity({ groupSize: 3, roster })),
      "GET /api/work-help/availability": json(200, { available: true, reason: null }),
    });
    vi.stubGlobal("fetch", api.fetch);
    const { container } = renderWithProviders(<ActivityDetail classId={CLASS_ID} activityId={ACTIVITY_ID} canApply canRelease={false} initialTab="alunos" />);

    const table = await screen.findByRole("table", { name: "Situação de cada aluno nesta atividade." });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const link = within(rows[0]!).getByRole("link");
    expect(link.textContent).toBe("Ana Souza e mais 2 Em grupo");
    expect(link.getAttribute("href")).toBe(`/turmas/${CLASS_ID}/atividades/${ACTIVITY_ID}/tentativas/${ATTEMPT_ID}`);
    expect(within(rows[1]!).getByRole("link").textContent).toBe("Davi Rocha");
    await expectNoA11yViolations(container);
  });

  it("023/US6-2 023/US6-3 integrantes, histórico em palavras e \"Salvo por <nome> às hh:mm (revisão n)\" com os anteriores recolhidos; axe", async () => {
    const api = routedFetch({
      [`GET ${PATH}`]: json(200, gradingActivity({ groupSize: 3 })),
      [`GET ${ATTEMPT_PATH}`]: json(200, teacherAttempt({ student: { userId: ANA.id, name: ANA.name }, participants: PARTICIPANTS, group: true })),
      [`GET ${ATTEMPT_PATH}/group`]: json(200, FACTS),
    });
    vi.stubGlobal("fetch", api.fetch);
    const user = userEvent.setup();
    const { container } = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade canMark={false} />);

    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe("Tentativa de Ana Souza e mais 2 Em grupo");
    const section = await screen.findByRole("region", { name: "Grupo" });
    const members = await within(section).findByRole("list", { name: "Integrantes" });
    expect(within(members).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `Ana Souza (líder) — Entrou às ${formatTime(at(0))}`,
      `Bruno Lima — Entrou às ${formatTime(at(0))}, incluído por Ana Souza`,
      `Carla Dias — Entrou às ${formatTime(at(5))}, incluído por Ana Souza`,
    ]);
    const history = within(section).getByRole("list", { name: "Histórico da edição" });
    expect(within(history).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `Ana Souza passou a edição para Bruno Lima às ${formatTime(at(12))}`,
      `A edição voltou para Ana Souza às ${formatTime(at(20))}: Bruno Lima saiu da sala`,
    ]);

    const saves = within(section).getByRole("list", { name: "Quem salvou cada resposta" });
    expect(within(saves).getByText(`Questão 1: Salvo por Ana Souza às ${formatTime(at(10))} (revisão 1)`)).toBeTruthy();
    expect(within(saves).getByText(`Questão 2: Salvo por Bruno Lima às ${formatTime(at(15))} (revisão 3)`)).toBeTruthy();
    // The earlier saves stay collapsed until asked (newest first).
    expect(within(saves).queryByText(`Salvo por Ana Souza às ${formatTime(at(13))} (revisão 2)`)).toBeNull();
    await user.click(within(saves).getByRole("button", { name: "Ver os 2 salvamentos anteriores da questão 2" }));
    const earlier = await within(saves).findByText(`Salvo por Ana Souza às ${formatTime(at(13))} (revisão 2)`);
    expect(earlier.nextElementSibling?.textContent).toBe(`Salvo por Ana Souza às ${formatTime(at(11))} (revisão 1)`);

    expect(section.textContent).not.toMatch(/fraude|cola\b|violação/i);
    await expectNoA11yViolations(container);
  });

  it("023/US6-4 a linha do tempo da 015 e as saídas da sala da 016 trazem o nome do aluno de cada fato", async () => {
    const totals = {
      screenExits: 1, timeAwaySeconds: 60, fullscreenExits: 0, disconnections: 0, offlineSeconds: 0,
      clipboardBlocks: 0, typingLimitRejections: 0, fullscreenUnavailable: false, detectionUnavailable: false,
    };
    const event = { questionPosition: null, clientOccurredAt: null, buffered: false, occurrenceOrdinal: null, idleSeconds: null };
    const api = routedFetch({
      [`GET ${PATH}`]: json(200, gradingActivity({ groupSize: 3, executionMode: "CONTROLLED", releaseMode: "PRESENT_ONLY" })),
      [`GET ${ATTEMPT_PATH}`]: json(200, teacherAttempt({ student: { userId: ANA.id, name: ANA.name }, participants: PARTICIPANTS, group: true })),
      [`GET ${ATTEMPT_PATH}/group`]: json(200, FACTS),
      [`GET ${ATTEMPT_PATH}/integrity`]: json(200, {
        events: [
          { ...event, type: "SCREEN_LEFT", recordedAt: at(30), studentUserId: BRUNO.id },
          { ...event, type: "SCREEN_RETURNED", recordedAt: at(31), studentUserId: BRUNO.id },
        ],
        intervals: [{ kind: "SCREEN", from: at(30), to: at(31), seconds: 60, open: false, studentUserId: BRUNO.id }],
        totals,
        holds: [],
      }),
      [`GET ${ATTEMPT_PATH}/pauses`]: json(200, {
        items: [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9", studentUserId: CARLA.id, initiatedBy: "STUDENT", reason: "WATER", note: null,
            startedAt: at(40), endedAt: at(42), endedBy: "RELEASE", seconds: 120,
          },
        ],
        totalSecondsAway: 120,
      }),
    });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade canMark={false} />);

    const records = await screen.findByRole("table", { name: "Eventos da tentativa, no horário do servidor." });
    const [header, left] = within(records).getAllByRole("row");
    expect(within(header!).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Horário", "Aluno", "Evento", "Duração"]);
    expect(within(left!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([formatTime(at(30)), "Bruno Lima", "Saiu da tela", "1 min"]);
    const exits = await screen.findByRole("table", { name: "Saídas da sala desta tentativa, no horário do servidor." });
    expect(within(within(exits).getAllByRole("row")[1]!).getAllByRole("cell")[0]!.textContent).toBe("Carla Dias");
  });

  it("023/US6-2 uma tentativa individual não mostra \"Grupo\" nem pede os fatos do grupo", async () => {
    const api = routedFetch({ [`GET ${PATH}`]: json(200, gradingActivity()), [`GET ${ATTEMPT_PATH}`]: json(200, teacherAttempt()) });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade canMark={false} />);
    expect((await screen.findByRole("heading", { level: 2 })).textContent).toBe("Tentativa de Bruno Lima");
    expect(screen.queryByRole("region", { name: "Grupo" })).toBeNull();
    expect(api.calls.some((call) => call.url.endsWith("/group"))).toBe(false);
  });

  it("023/US6-5 nenhum texto do grupo chama uma edição, passagem ou saída de \"fraude\", \"cola\" ou \"violação\"", () => {
    for (const file of ["../schemas/group-facts.ts", "./group-facts.tsx"]) {
      expect(readFileSync(join(__dirname, file), "utf8"), file).not.toMatch(/fraude|\bcola\b|violação/i);
    }
  });
});
