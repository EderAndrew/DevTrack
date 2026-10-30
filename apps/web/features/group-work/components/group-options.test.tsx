import type {
  StudentActivity,
  StudentHelpState,
  StudentQuestion,
} from "@repo/contracts";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import type { TeacherQuestion } from "@repo/contracts";
import {
  AttemptHelpContext,
  AttemptParticipantsContext,
  QuestionHelpRecords,
} from "@/features/activities/components/attempt-records";
import { CodeRunSummary } from "@/features/code-run/components/code-run-summary";
import {
  ATTEMPT_ID,
  available,
  CLASS_ID,
  lastFinished,
} from "@/features/code-run/components/test-fixtures";
import { ControlledAttempt } from "@/features/controlled-attempt/components/controlled-attempt";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import {
  json,
  routedFetch,
  studentActivity,
} from "@/features/student-activities/components/test-fixtures";
import {
  helpItem,
  helpState,
} from "@/features/work-help/components/test-fixtures";
import { ASK_HELP } from "@/features/work-help/schemas/work-help";
import { GROUP_POLL_MS } from "../schemas/group-work";

// 023/US7 (contracts/web-ui.md): the 015 and 021 options inside a group — the group bar on the focus page too,
// "Pedir ajuda" only for whoever edits while every member reads the group's orientations, and "Executar" for a
// reader as well, with the answer their screen shows. The API decides; the screen follows its `group`.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ANA = { id: "eeeeeeee-0000-4000-8000-000000000001", name: "Ana Souza" };
const BRUNO = {
  id: "eeeeeeee-0000-4000-8000-000000000002",
  name: "Bruno Lima",
};
const base = studentActivity();
const codeQuestion = base.questions[2]! as StudentQuestion;
const runnable: StudentQuestion = {
  ...codeQuestion,
  execution: available({
    languageVersion: "Java 25",
    convention: "JAVA_MAIN_CLASS",
  }),
};
const SAVED_SOURCE = "class Main { /* do grupo */ }";
const DETAIL = `/api/me/activities/${base.id}`;
const HELP = `${DETAIL}/attempt/help`;
const RUNS = `${DETAIL}/questions/${runnable.id}/code-runs`;

/** Bruno reads Ana's group's attempt (Ana edits) unless `editing`; the CODE question saved by Ana. */
const groupActivity = ({
  editing = false,
  used = 0,
  ...overrides
}: Partial<StudentActivity> & {
  editing?: boolean;
  used?: number;
} = {}): StudentActivity =>
  studentActivity({
    status: "IN_PROGRESS",
    aiHelp: { allowance: 3, used },
    groupSize: 3,
    group: {
      groupSize: 3,
      leader: ANA,
      members: [ANA, BRUNO],
      editor: editing ? BRUNO : ANA,
      myRole: "MEMBER",
      canEdit: editing,
      addedBy: ANA,
      freeSlots: 1,
      version: 1,
    },
    questions: [runnable],
    attempt: {
      number: 1,
      startedAt: "2026-10-02T11:00:00.000Z",
      lastSavedAt: "2026-10-02T11:30:00.000Z",
      answers: [
        {
          questionId: runnable.id,
          answer: { kind: "CODE", source: SAVED_SOURCE },
          revision: 2,
          savedBy: ANA,
        },
      ],
    },
    ...overrides,
  });

function setup(
  routes: Parameters<typeof routedFetch>[0],
  ui = <ActivityAnswering activityId={base.id} userId="aluno-2" />,
) {
  const api = routedFetch({
    [`GET ${RUNS}/latest`]: json(200, { run: null }),
    ...routes,
  });
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const view = renderWithProviders(ui);
  return { ...view, api, user: userEvent.setup() };
}

describe("023/US7 modo controlado, ajuda da IA e execução no grupo", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("023/US7-1 a barra do grupo aparece na página de foco, com quem edita agora", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => false,
    });
    const { container } = setup(
      {
        [`GET ${DETAIL}`]: json(
          200,
          groupActivity({ executionMode: "CONTROLLED" }),
        ),
        [`GET ${HELP}`]: json(200, helpState()),
        [`POST ${DETAIL}/attempt/events`]: json(200, { recorded: [] }),
      },
      <ControlledAttempt activityId={base.id} userId="aluno-2" />,
    );
    expect(await screen.findByText("Modo controlado")).toBeTruthy();
    expect(
      within(screen.getByRole("status", { name: "Editando agora" })).getByText(
        "Ana Souza",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Ana Souza (líder), Bruno Lima")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('023/US7-3 "Pedir ajuda" só para quem edita; as orientações do grupo aparecem para todos, também as que chegam depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    focusManager.setFocused(true);
    const delivered = helpItem({
      questionId: runnable.id,
      message: "Comece lendo os dois inteiros da entrada.",
    });
    let reads = 0;
    let helps: StudentHelpState = helpState();
    const reader = setup({
      [`GET ${DETAIL}`]: () =>
        json(200, groupActivity({ used: reads++ === 0 ? 0 : 1 })),
      [`GET ${HELP}`]: () => json(200, helps),
    });
    await screen.findByText("A edição está com Ana Souza.");
    expect(screen.queryByRole("button", { name: ASK_HELP })).toBeNull();
    // Ana's request is delivered: the polled count moves and Bruno reads the orientation.
    helps = helpState({ used: 1, items: [delivered] });
    await act(() => vi.advanceTimersByTimeAsync(GROUP_POLL_MS));
    expect(
      await screen.findByText("Comece lendo os dois inteiros da entrada."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: ASK_HELP })).toBeNull();
    reader.unmount();

    setup({
      [`GET ${DETAIL}`]: json(200, groupActivity({ editing: true, used: 1 })),
      [`GET ${HELP}`]: json(200, helpState({ used: 1, items: [delivered] })),
    });
    expect(await screen.findByRole("button", { name: ASK_HELP })).toBeTruthy();
    expect(
      screen.getByText("Comece lendo os dois inteiros da entrada."),
    ).toBeTruthy();
  });

  it("023/US7-4 quem só lê também executa: envia a resposta do grupo que está na tela e não salva", async () => {
    const { user, api, container } = setup({
      [`GET ${DETAIL}`]: json(200, groupActivity()),
      [`GET ${HELP}`]: json(200, helpState()),
      [`POST ${RUNS}`]: json(202, {
        id: "eeeeeeee-0000-4000-8000-000000000099",
        questionId: runnable.id,
        status: "QUEUED",
        failureReason: null,
        outcome: null,
        sourceCode: SAVED_SOURCE,
        compileOutput: null,
        publicCaseCount: 1,
        passedCount: null,
        createdAt: "2026-10-02T12:00:00.000Z",
        finishedAt: null,
        contentPurged: false,
        cases: [],
      }),
    });
    await screen.findByText("A edição está com Ana Souza.");
    await user.click(screen.getByRole("button", { name: "Executar" }));
    expect(await screen.findByText("Na fila")).toBeTruthy();
    const posted = api.calls.find(
      (call) => call.method === "POST" && call.url === RUNS,
    );
    expect(JSON.parse(String(posted?.body))).toEqual({
      sourceCode: SAVED_SOURCE,
    });
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
    await expectNoA11yViolations(container);
  });

  it("023/FR-021 na correção do grupo, cada ajuda diz quem pediu e a última execução quem executou", async () => {
    const participants = [
      { id: ANA.id, name: ANA.name, isLeader: true },
      { id: BRUNO.id, name: BRUNO.name, isLeader: false },
    ];
    const question = {
      id: runnable.id,
      position: 0,
      type: "CODE",
      language: null,
    } as unknown as TeacherQuestion;
    setup(
      {
        [`GET /api/classes/${CLASS_ID}/activities/${base.id}/attempts/${ATTEMPT_ID}/code-runs`]:
          json(200, {
            questions: [
              {
                questionId: runnable.id,
                runCount: 2,
                pending: false,
                lastFinished: lastFinished({ studentUserId: BRUNO.id }),
              },
            ],
          }),
      },
      <AttemptParticipantsContext.Provider value={participants}>
        <AttemptHelpContext.Provider
          value={[
            {
              id: "dddddddd-0000-4000-8000-000000000001",
              studentUserId: ANA.id,
              questionPosition: 0,
              question: "Por onde começo?",
              status: "DELIVERED",
              message: "Leia a entrada primeiro.",
              example: null,
              reasonCode: null,
              requestedAt: "2026-10-02T12:00:00.000Z",
              resolvedAt: "2026-10-02T12:00:05.000Z",
            },
          ]}
        >
          <QuestionHelpRecords question={question} />
        </AttemptHelpContext.Provider>
        <CodeRunSummary
          classId={CLASS_ID}
          activityId={base.id}
          attemptId={ATTEMPT_ID}
          questionId={runnable.id}
          position={0}
          participants={participants}
        />
      </AttemptParticipantsContext.Provider>,
    );
    expect(screen.getByText("Pedida por Ana Souza")).toBeTruthy();
    expect(await screen.findByText(/Executada por Bruno Lima/)).toBeTruthy();
  });
});
