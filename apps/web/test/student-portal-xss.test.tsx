import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import { CodeEditor } from "@/components/ui/code/code-editor";
import { codeMirrorContent, codeMirrorText } from "./code-editor";
import { renderWithProviders } from "./render";

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

  it("nenhum dangerouslySetInnerHTML nas telas da 012, no ranking da 013, nos componentes de avaliação e de código e nos bancos (014)", () => {
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
