import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExamMonitor, StudentActivity, StudentPause, TeacherPause } from "@repo/contracts";
import { AttemptReview } from "@/features/activities/components/attempt-review";
import {
  ACTIVITY_ID,
  ATTEMPT_ID,
  CLASS_ID,
  EXERCISE_ATTEMPT_ID,
  exerciseAttempt as teacherExerciseAttempt,
  gradingActivity,
  json,
  MARK_CODE_ID,
  MARK_OPEN_ID,
  markingActivity,
  OPEN_QUESTION_ID,
  routedFetch as teacherFetch,
  teacherAttempt,
} from "@/features/activities/components/test-fixtures";
import { AttendanceTab } from "@/features/attendance/components/attendance-tab";
import { ExamAttempt } from "@/features/exam-attempt/components/exam-shell";
import { ExamRoomPanel } from "@/features/exam-session/components/exam-room-panel";
import { ExamDetail } from "@/features/exams/components/exam-detail";
import { examApiMock, examView } from "@/features/exams/components/test-fixtures";
import { PausedNotice } from "@/features/attendance/components/paused-notice";
import { ATTENDANCE_PATH, MARKED_AT, room, student } from "@/features/attendance/components/test-fixtures";
import { RankingCard } from "@/features/ranking/components/ranking-card";
import { RankingTable } from "@/features/ranking/components/ranking-table";
import { row } from "@/features/ranking/components/test-fixtures";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import {
  exerciseActivity,
  exerciseAttempt,
  routedFetch as studentFetch,
  studentActivity,
} from "@/features/student-activities/components/test-fixtures";
import { CodeBlock } from "@/components/ui/code/code-block";
import { CodeRunResult } from "@/features/code-run/components/code-run-result";
import { CodeRunSummary } from "@/features/code-run/components/code-run-summary";
import {
  ACTIVITY_ID as RUN_ACTIVITY_ID,
  ATTEMPT_ID as RUN_ATTEMPT_ID,
  available,
  CLASS_ID as SUMMARY_CLASS_ID,
  codeRun,
  QUESTION_ID as RUN_QUESTION_ID,
  summaryQuestion,
} from "@/features/code-run/components/test-fixtures";
import { CodeEditor } from "@/components/ui/code/code-editor";
import { AdminFeedbackDetail } from "@/features/feedback/components/admin-feedback-detail";
import { AdminFeedbackList } from "@/features/feedback/components/admin-feedback-list";
import { MyFeedbacks } from "@/features/feedback/components/my-feedbacks";
import { Toaster } from "@/components/ui/toast";
import { codeMirrorContent, codeMirrorText } from "./code-editor";
import { renderWithProviders } from "./render";

// 018: the exam screens navigate (ExamDetail, ExamAttempt); the router is not mounted in a unit test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const SCRIPT = `<script>alert("xss")</script><img src=x onerror="alert(1)">`;
const WEB_ROOT = resolve(__dirname, "..");
// Since 014 also the code components and the bank screens that show or edit code.
const SCANNED = [
  "features/activities",
  "features/student-activities",
  "features/ranking",
  "components/ui/assessment",
  "components/ui/code",
  "features/exercises",
  "features/works",
  // 015: the controlled mode and the AI help.
  "features/controlled-attempt",
  "features/work-help",
  // 016: the attendance, the room panel and the paused notice.
  "features/attendance",
  // 018: the Banco de Provas, the student's exam and the teacher's exam room.
  "features/exams",
  "features/exam-attempt",
  "features/exam-session",
  // 019: the Code Runner's panel and result; 021: the teacher's run summary.
  "features/code-run",
  // 020: the student's feedback dialog and list, the ADMIN's list and detail.
  "features/feedback",
  // 023: the group work's start dialog and bar (names of classmates).
  "features/group-work",
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * 012/FR-035: what students and teachers write (answers, titles, feedback) holding `<script>` and
 * HTML renders as text on the student's and the teacher's screens, and no component of these
 * features sets HTML (`dangerouslySetInnerHTML`). Since 013 the same holds for the exercise result
 * (answer, answer key, explanation, the teacher's comment), the teacher's marks and the names in the
 * ranking (`features/ranking`).
 */
describe("012/FR-035 conteúdo de aluno e professor como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("nenhum dangerouslySetInnerHTML nas telas da 012, no ranking da 013, nos componentes de avaliação e de código, nos bancos (014), no Code Runner (019) e nos feedbacks (020)", () => {
    const offenders = SCANNED.flatMap((dir) => filesUnder(join(WEB_ROOT, dir)))
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"));
    expect(offenders).toEqual([]);
  });

  it("tela do aluno: título, enunciado, resposta e feedback com HTML aparecem como texto", async () => {
    const base = studentActivity();
    const [open] = base.questions;
    const activity = studentActivity({
      title: SCRIPT,
      instructions: SCRIPT,
      status: "GRADED",
      canAnswer: false,
      questions: [{ ...open!, statement: SCRIPT }],
      attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [{ questionId: open!.id, answer: { kind: "TEXT", text: SCRIPT }, revision: 1 }] },
      submission: { submittedAt: "2026-10-02T12:30:00.000Z", late: false, acceptedByTeacher: false, blankCount: 0 },
      result: { grade: "0.40", generalFeedback: SCRIPT, questions: [{ questionId: open!.id, grade: "0.40", feedback: SCRIPT }] },
    });
    vi.stubGlobal("fetch", studentFetch({ [`GET /api/me/activities/${activity.id}`]: json(200, activity) }).fetch);
    const { container } = renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
    await screen.findByRole("region", { name: "Resultado" });
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThan(1);
  });

  it("tela do professor: resposta e feedback com HTML aparecem como texto", async () => {
    const attempt = teacherAttempt({
      answers: [{ questionId: OPEN_QUESTION_ID, answer: { kind: "TEXT", text: SCRIPT }, savedAt: "2026-10-05T11:58:00.000Z" }],
    });
    const path = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
    vi.stubGlobal(
      "fetch",
      teacherFetch({
        [`GET ${path}`]: json(200, gradingActivity({ title: SCRIPT })),
        [`GET ${path}/attempts/${ATTEMPT_ID}`]: json(200, attempt),
      }).fetch,
    );
    const { container } = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={false} canMark={false} />);
    await screen.findByRole("heading", { name: "Tentativa de Bruno Lima" });
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByText(SCRIPT)).toBeTruthy();
  });

  it("013 resultado do exercício: resposta, gabarito, explicação e comentário do professor com HTML aparecem como texto", async () => {
    const base = exerciseAttempt();
    const lastResult = {
      ...base,
      questions: base.questions.map((question) => ({
        ...question,
        answer: question.answer?.kind === "TEXT" ? { kind: "TEXT" as const, text: SCRIPT } : question.answer,
        expectedAnswer: question.expectedAnswer === null ? null : SCRIPT,
        explanation: SCRIPT,
        teacherComment: SCRIPT,
      })),
    };
    const activity = exerciseActivity({
      title: SCRIPT,
      status: "COMPLETED",
      points: { possible: 105, earned: 30, awaitingCorrection: true },
      completedAttempts: [{ number: 1, completedAt: lastResult.completedAt }],
      lastResult,
    });
    vi.stubGlobal("fetch", studentFetch({ [`GET /api/me/activities/${activity.id}`]: json(200, activity) }).fetch);
    const { container } = renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
    await screen.findByRole("heading", { name: "Resultado da tentativa 1" });
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThanOrEqual(5);
  });

  it("013 marcação do professor: resposta e comentário com HTML aparecem como texto", async () => {
    const attempt = teacherExerciseAttempt({ [MARK_CODE_ID]: { comment: SCRIPT } });
    attempt.answers = attempt.answers.map((answer) => (answer.questionId === MARK_OPEN_ID ? { ...answer, answer: { kind: "TEXT", text: SCRIPT } } : answer));
    const path = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
    vi.stubGlobal(
      "fetch",
      teacherFetch({
        [`GET ${path}`]: json(200, markingActivity({ title: SCRIPT })),
        [`GET ${path}/attempts/${EXERCISE_ATTEMPT_ID}`]: json(200, attempt),
      }).fetch,
    );
    const { container } = renderWithProviders(
      <AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={EXERCISE_ATTEMPT_ID} canGrade={false} canMark={false} />,
    );
    await screen.findByRole("heading", { name: "Tentativa de Bruno Lima" });
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThanOrEqual(2);
  });

  it("013 ranking: nomes com HTML aparecem como texto na tabela e no cartão do painel", () => {
    const rows = [row(1, SCRIPT, 30, true), row(2, `Ana ${SCRIPT}`, 0)];
    const table = renderWithProviders(<RankingTable rows={rows} caption="Ranking" />);
    expect(table.container.querySelector("script, img")).toBeNull();
    expect(screen.getAllByText(SCRIPT, { exact: false })).toHaveLength(2);
    table.unmount();
    const card = renderWithProviders(<RankingCard ranking={{ class: { id: CLASS_ID, name: SCRIPT }, top: rows }} />);
    expect(card.container.querySelector("script, img")).toBeNull();
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThanOrEqual(3);
  });

  it.each(["html", "java"])("014/SC-003 código com <script> e HTML em %s aparece como texto no editor e no CodeBlock", async (highlight) => {
    const code = `${SCRIPT}\n<b onclick="alert(2)">negrito</b>`;
    const editor = render(<CodeEditor id="xss" aria-label="Código" highlight={highlight} value={code} onChange={() => undefined} />);
    const content = await codeMirrorContent(editor.container);
    await waitFor(() => expect(content.querySelector("span[class]")).toBeTruthy());
    expect(codeMirrorText(content)).toBe(code);
    expect(document.querySelector("script, img, b")).toBeNull();
    editor.unmount();

    const block = render(<CodeBlock code={code} highlight={highlight} label="Código" />);
    await waitFor(() => expect(block.container.querySelector("code span")).toBeTruthy());
    expect(block.container.querySelector("code")!.textContent).toBe(code);
    expect(document.querySelector("script, img, b")).toBeNull();
  });
});

/**
 * 015/FR-029: the student's question to the AI, the orientation and its example, on the student's
 * screen and in the teacher's review, render as text; the controlled mode's timeline carries no
 * free text, and the review with it shows none of the question's HTML either.
 */
describe("015 ajuda da IA e registros como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tela do aluno: pergunta, orientação e exemplo com HTML aparecem como texto", async () => {
    const base = studentActivity();
    const [open] = base.questions;
    const activity = studentActivity({
      status: "IN_PROGRESS",
      aiHelp: { allowance: 3, used: 1 },
      attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
    });
    const help = {
      allowance: 3,
      used: 1,
      pending: false,
      items: [
        {
          id: "eeeeeeee-0000-4000-8000-000000000001",
          questionId: open!.id,
          question: SCRIPT,
          status: "DELIVERED",
          message: SCRIPT,
          example: { code: SCRIPT },
          requestedAt: "2026-10-02T11:10:00.000Z",
          resolvedAt: "2026-10-02T11:10:05.000Z",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      studentFetch({
        [`GET /api/me/activities/${activity.id}`]: json(200, activity),
        [`GET /api/me/activities/${activity.id}/attempt/help`]: json(200, help),
      }).fetch,
    );
    const { container } = renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
    await screen.findByText(`Sua pergunta: ${SCRIPT}`);
    expect(screen.getAllByText(SCRIPT).length).toBeGreaterThan(0);
    await waitFor(() => expect(container.querySelector("pre")?.textContent).toContain("<script>"));
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("tela do professor: pergunta e orientação com HTML aparecem como texto, ao lado da linha do tempo", async () => {
    const path = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
    const help = {
      allowance: 3,
      used: 1,
      items: [
        {
          id: "eeeeeeee-0000-4000-8000-000000000002",
          questionPosition: 0,
          question: SCRIPT,
          status: "DELIVERED",
          message: SCRIPT,
          example: { code: SCRIPT },
          reasonCode: null,
          requestedAt: "2026-10-02T12:04:00.000Z",
          resolvedAt: "2026-10-02T12:04:05.000Z",
        },
      ],
    };
    const timeline = {
      events: [{ type: "SCREEN_LEFT", questionPosition: null, recordedAt: "2026-10-02T12:00:00.000Z", clientOccurredAt: null, buffered: false }],
      intervals: [{ kind: "SCREEN", from: "2026-10-02T12:00:00.000Z", to: "2026-10-02T12:01:00.000Z", seconds: 60, open: true }],
      totals: {
        screenExits: 1,
        timeAwaySeconds: 60,
        fullscreenExits: 0,
        disconnections: 0,
        offlineSeconds: 0,
        clipboardBlocks: 0,
        typingLimitRejections: 0,
        fullscreenUnavailable: false,
        detectionUnavailable: false,
      },
    };
    vi.stubGlobal(
      "fetch",
      teacherFetch({
        [`GET ${path}`]: json(200, gradingActivity({ executionMode: "CONTROLLED", aiHelp: { allowance: 3 } })),
        [`GET ${path}/attempts/${ATTEMPT_ID}`]: json(200, teacherAttempt()),
        [`GET ${path}/attempts/${ATTEMPT_ID}/integrity`]: json(200, timeline),
        [`GET ${path}/attempts/${ATTEMPT_ID}/help`]: json(200, help),
      }).fetch,
    );
    const { container } = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={false} canMark={false} />);
    await screen.findByText(`Pergunta do aluno: ${SCRIPT}`);
    expect(screen.getByText(`Orientação: ${SCRIPT}`)).toBeTruthy();
    expect(await screen.findByRole("table", { name: "Eventos da tentativa, no horário do servidor." })).toBeTruthy();
    await waitFor(() => expect(container.querySelector("pre")?.textContent).toContain("<script>"));
    expect(container.querySelector("script, img")).toBeNull();
  });
});

/**
 * 016: the note of a room exit declared as "Outro" is the student's text: on the teacher's room
 * panel, in the review's "Saídas da sala", on the student's paused notice and in the student's own
 * delivery (history) it renders as text, never as HTML.
 */
describe("016 nota de \"Outro\" como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  const PAUSE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee16";
  const teacherPause: TeacherPause = {
    id: PAUSE_ID,
    initiatedBy: "STUDENT",
    reason: "OTHER",
    note: SCRIPT,
    startedAt: "2026-10-02T13:30:00.000Z",
    endedAt: null,
    endedBy: null,
    seconds: 120,
  };
  const studentPause: StudentPause = { id: PAUSE_ID, initiatedBy: "STUDENT", reason: "OTHER", note: SCRIPT, startedAt: "2026-10-02T13:30:00.000Z", endedAt: null };

  it("painel da sala do professor: a nota aparece como texto", async () => {
    const out = room([student("cccccccc-cccc-4ccc-8ccc-ccccccccccc1", "Ana Souza", { markedAt: MARKED_AT, roomStatus: "OUT_OF_ROOM", attemptId: ATTEMPT_ID, openPause: teacherPause })]);
    vi.stubGlobal("fetch", teacherFetch({ [`GET ${ATTENDANCE_PATH}`]: json(200, out) }).fetch);
    const { container } = renderWithProviders(<AttendanceTab classId={CLASS_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText(SCRIPT, { exact: false });
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("correção: \"Saídas da sala\" mostra a nota como texto", async () => {
    const path = `/api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}`;
    vi.stubGlobal(
      "fetch",
      teacherFetch({
        [`GET ${path}`]: json(200, gradingActivity({ releaseMode: "PRESENT_ONLY", attendance: { present: 1, enrolled: 1 } })),
        [`GET ${path}/attempts/${ATTEMPT_ID}`]: json(200, teacherAttempt()),
        [`GET ${path}/attempts/${ATTEMPT_ID}/pauses`]: json(200, {
          items: [{ ...teacherPause, endedAt: "2026-10-02T13:32:00.000Z", endedBy: "RELEASE" }],
          totalSecondsAway: 120,
        }),
      }).fetch,
    );
    const { container } = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={false} canMark={false} />);
    await screen.findByText(`Outro: ${SCRIPT}`);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("aviso de pausa do aluno: a própria nota aparece como texto", async () => {
    const activity = "22222222-2222-4222-8222-222222222222";
    vi.stubGlobal("fetch", studentFetch({ [`GET /api/me/activities/${activity}/attempt/pause`]: json(200, { pause: studentPause }) }).fetch);
    const { container } = renderWithProviders(<PausedNotice activityId={activity} pause={studentPause} deadline="2026-10-02T17:00:00.000Z" onResume={() => undefined} />);
    expect(screen.getByRole("status").textContent).toContain(SCRIPT);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("histórico do aluno: as saídas da entrega mostram a nota como texto", async () => {
    const delivered = studentActivity({
      type: "ASSIGNMENT",
      status: "SUBMITTED",
      canAnswer: false,
      submittedAt: "2026-10-02T14:30:00.000Z",
      attempt: { number: 1, startedAt: "2026-10-02T13:00:00.000Z", lastSavedAt: null, answers: [] },
      submission: { submittedAt: "2026-10-02T14:30:00.000Z", late: false, acceptedByTeacher: false, blankCount: 0 },
      pauses: [{ ...studentPause, endedAt: "2026-10-02T13:32:00.000Z" }],
    });
    vi.stubGlobal("fetch", studentFetch({ [`GET /api/me/activities/${delivered.id}`]: json(200, delivered) }).fetch);
    const { container } = renderWithProviders(<ActivityAnswering activityId={delivered.id} userId="aluno-1" />);
    const list = await screen.findByRole("list", { name: "Saídas da sala" });
    expect(list.textContent).toContain(`Outro (${SCRIPT})`);
    expect(container.querySelector("script, img")).toBeNull();
  });
});

/**
 * 018: the exam's statements, answer keys and the student's answers are text. The Banco de Provas
 * detail (title, statement, expected answer), the student's exam on the focus page (statement and the
 * saved answer) and the teacher's exam room (the student's name) render them as text, never as HTML.
 */
describe("018 prova como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Banco de Provas: título, enunciado e resposta esperada com HTML ficam como texto nos campos", async () => {
    const base = examView();
    const exam = examView({ title: SCRIPT, questions: base.questions.map((question) => ({ ...question, statement: SCRIPT, expectedAnswer: SCRIPT })) });
    vi.stubGlobal("fetch", vi.fn(examApiMock(() => json(200, exam), { [`/api/exams/${exam.id}`]: () => json(200, exam) })));
    const { container } = renderWithProviders(<ExamDetail examId={exam.id} canEdit={false} canApprove={false} canArchive={false} />);
    // The detail is the bank's form: the title, statements and expected answers are field values, never markup.
    const values = async () => (await screen.findAllByRole("textbox")).map((field) => (field as HTMLInputElement).value);
    await waitFor(async () => expect((await values()).filter((value) => value === SCRIPT)).toHaveLength(5));
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("prova do aluno na página de foco: enunciado e resposta salva com HTML aparecem como texto", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
    const base = studentActivity();
    const [open] = base.questions;
    const startedAt = "2026-10-02T12:00:00.000Z";
    const exam: StudentActivity = studentActivity({
      type: "EXAM",
      executionMode: "CONTROLLED",
      title: SCRIPT,
      deadline: null,
      latePolicy: null,
      status: "IN_PROGRESS",
      serverNow: startedAt,
      questions: [{ ...open!, statement: SCRIPT }],
      attempt: { number: 1, startedAt, lastSavedAt: null, answers: [{ questionId: open!.id, answer: { kind: "TEXT", text: SCRIPT }, revision: 1 }] },
      exam: {
        durationMinutes: 60,
        inactivityLimitSeconds: 60,
        startDeadline: "2026-10-02T12:15:00.000Z",
        endsAt: "2026-10-02T13:00:00.000Z",
        occurrences: { count: 0, warningsAllowed: 3 },
        hold: null,
        endReason: null,
        ownOccurrences: [],
      },
    });
    vi.stubGlobal("fetch", studentFetch({ [`GET /api/me/activities/${exam.id}`]: json(200, exam) }).fetch);
    const { container } = renderWithProviders(<ExamAttempt activityId={exam.id} userId="aluno-1" />);
    await screen.findByRole("timer", { name: "Tempo restante" });
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThan(0);
    expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toBe(SCRIPT);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("sala da prova do professor: o nome do aluno com HTML aparece como texto", async () => {
    const monitor: ExamMonitor = {
      activityId: ACTIVITY_ID,
      durationMinutes: 30,
      startDeadline: "2026-10-01T12:15:00.000Z",
      closesAt: "2026-10-01T12:45:00.000Z",
      serverNow: "2026-10-01T12:20:00.000Z",
      students: [
        {
          studentUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccc18",
          name: SCRIPT,
          markedAt: "2026-10-01T12:00:00.000Z",
          examStatus: "ANSWERING",
          attemptId: ATTEMPT_ID,
          startedAt: "2026-10-01T12:00:00.000Z",
          endsAt: "2026-10-01T12:30:00.000Z",
          occurrenceCount: 1,
          openHold: null,
          openPause: null,
        },
      ],
    };
    vi.stubGlobal("fetch", teacherFetch({ [`GET /api/classes/${CLASS_ID}/activities/${ACTIVITY_ID}/exam-monitor`]: json(200, monitor) }).fetch);
    const { container } = renderWithProviders(<ExamRoomPanel classId={CLASS_ID} activityId={ACTIVITY_ID} canDecide active />);
    await screen.findAllByText(SCRIPT, { exact: false });
    expect(container.querySelector("script, img")).toBeNull();
  });
});

/**
 * 019/FR-021: what the student's program printed, its stderr, the compiler message and the public
 * cases (input and expected output typed by the teacher) render as text in `CodeBlock`, never as HTML.
 */
describe("019/FR-021 resultado da execução como texto", () => {
  it("saída obtida, saída de erro, entrada e saída esperada com HTML aparecem como texto", () => {
    const run = codeRun({
      sourceCode: SCRIPT,
      passedCount: 0,
      publicCaseCount: 1,
      cases: [{ position: 0, verdict: "RUNTIME_ERROR", stdout: SCRIPT, stderr: SCRIPT, durationMs: 70 }],
    });
    const { container } = renderWithProviders(<CodeRunResult run={run} publicTestCases={[{ input: SCRIPT, expectedOutput: SCRIPT }]} sourceCode={SCRIPT} />);
    // The failing case opens by itself: input, expected output, obtained output and stderr.
    expect(screen.getAllByText(SCRIPT, { exact: false })).toHaveLength(4);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("mensagem do compilador com HTML aparece como texto", () => {
    const run = codeRun({ sourceCode: SCRIPT, outcome: "COMPILATION_ERROR", passedCount: 0, cases: [], compileOutput: SCRIPT });
    const { container } = renderWithProviders(<CodeRunResult run={run} publicTestCases={[{ input: "1", expectedOutput: "2" }]} sourceCode={SCRIPT} />);
    expect(screen.getAllByText(SCRIPT, { exact: false })).toHaveLength(1);
    expect(container.querySelector("script, img")).toBeNull();
  });
});

/**
 * 021/FR-013: on a work with "Permitir executar o código", the run's output, stderr and the public case
 * render as text on the student's answering screen, as in an exercise; the teacher's summary shows only
 * counts and verdicts, so nothing of a run (code, output) reaches the correction screen at all.
 */
describe("021/FR-013 execução num Trabalho e resumo do professor como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tela do aluno num Trabalho: saída, saída de erro e caso público com HTML aparecem como texto", async () => {
    const base = studentActivity();
    const code = base.questions.find((question) => question.type === "CODE")!;
    const question = { ...code, publicTestCases: [{ input: SCRIPT, expectedOutput: SCRIPT }], execution: available() };
    const activity = studentActivity({
      status: "IN_PROGRESS",
      questions: [question],
      attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
    });
    const run = codeRun({
      questionId: question.id,
      sourceCode: code.starterCode ?? "",
      passedCount: 0,
      publicCaseCount: 1,
      cases: [{ position: 0, verdict: "RUNTIME_ERROR", stdout: SCRIPT, stderr: SCRIPT, durationMs: 70 }],
    });
    vi.stubGlobal(
      "fetch",
      studentFetch({
        [`GET /api/me/activities/${activity.id}`]: json(200, activity),
        [`GET /api/me/activities/${activity.id}/questions/${question.id}/code-runs/latest`]: json(200, { run }),
      }).fetch,
    );
    const { container } = renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
    expect(await screen.findByText("0 de 1 caso público passou")).toBeTruthy();
    expect(screen.getAllByText(SCRIPT, { exact: false }).length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector("script, img")).toBeNull();
  });

  it("resumo do professor: só contagens e vereditos, nenhum elemento criado", async () => {
    const summary = `/api/classes/${SUMMARY_CLASS_ID}/activities/${RUN_ACTIVITY_ID}/attempts/${RUN_ATTEMPT_ID}/code-runs`;
    vi.stubGlobal("fetch", teacherFetch({ [`GET ${summary}`]: json(200, { questions: [summaryQuestion()] }) }).fetch);
    const { container } = renderWithProviders(
      <CodeRunSummary classId={SUMMARY_CLASS_ID} activityId={RUN_ACTIVITY_ID} attemptId={RUN_ATTEMPT_ID} questionId={RUN_QUESTION_ID} position={0} />,
    );
    expect(await screen.findByText("Última execução: 1 de 2 casos públicos passaram")).toBeTruthy();
    expect(container.querySelector("script, img")).toBeNull();
  });
});

/**
 * 020/FR-013, 020/SC-007: a feedback's message (and the student's name) holding HTML and a URL renders
 * as text on the three screens that show it — "Meus feedbacks", the ADMIN's list and detail: no
 * element is created from it and the URL never becomes a link.
 */
describe("020/FR-013 feedback como texto", () => {
  const URL_TEXT = "https://evil.example/roubar";
  const MESSAGE = `${SCRIPT} veja ${URL_TEXT}`;
  const ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const STUDENT = { id: "bbbbbbbb-0000-4000-8000-000000000001", name: SCRIPT };
  const CREATED_AT = "2026-10-25T12:00:00.000Z";

  afterEach(() => vi.unstubAllGlobals());

  const noMarkup = (container: HTMLElement) => {
    expect(container.querySelector("script, img")).toBeNull();
    expect(container.querySelector(`a[href*="evil.example"]`)).toBeNull();
  };

  it("020/FR-013 \"Meus feedbacks\": a mensagem com HTML e URL aparece como texto", async () => {
    const page = { items: [{ id: ID, category: "PROBLEM", message: MESSAGE, status: "RECEIVED", createdAt: CREATED_AT }], nextCursor: null };
    vi.stubGlobal("fetch", vi.fn(async () => json(200, page)));
    const { container } = renderWithProviders(
      <Toaster>
        <MyFeedbacks />
      </Toaster>,
    );
    expect((await screen.findByText(MESSAGE)).textContent).toBe(MESSAGE);
    noMarkup(container);
  });

  it("020/FR-013 lista do ADMIN: o trecho e o nome do aluno com HTML e URL aparecem como texto", async () => {
    const page = { items: [{ id: ID, category: "PROBLEM", status: "RECEIVED", excerpt: MESSAGE, student: STUDENT, createdAt: CREATED_AT }], nextCursor: null };
    vi.stubGlobal("fetch", vi.fn(async () => json(200, page)));
    const { container } = renderWithProviders(<AdminFeedbackList initialFilters={{}} />);
    expect((await screen.findByText(MESSAGE)).textContent).toBe(MESSAGE);
    expect(screen.getByText(SCRIPT)).toBeTruthy();
    noMarkup(container);
  });

  it("020/FR-013 detalhe do ADMIN: a mensagem, o nome e a tela de origem aparecem como texto", async () => {
    const detail = {
      id: ID,
      category: "PROBLEM",
      status: "RECEIVED",
      message: MESSAGE,
      originPath: "/painel",
      student: { ...STUDENT, email: "ana@exemplo.com" },
      createdAt: CREATED_AT,
      statusChangedAt: CREATED_AT,
      history: [],
    };
    vi.stubGlobal("fetch", vi.fn(async () => json(200, detail)));
    const { container } = renderWithProviders(
      <Toaster>
        <AdminFeedbackDetail id={ID} canChange={false} />
      </Toaster>,
    );
    expect((await screen.findByText(MESSAGE)).textContent).toBe(MESSAGE);
    // The student's name, next to the e-mail, also as text.
    expect(screen.getByText(`${SCRIPT} · ana@exemplo.com`)).toBeTruthy();
    noMarkup(container);
  });
});
