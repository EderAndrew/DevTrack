import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttemptReview } from "@/features/activities/components/attempt-review";
import {
  ACTIVITY_ID,
  ATTEMPT_ID,
  CLASS_ID,
  gradingActivity,
  json,
  OPEN_QUESTION_ID,
  routedFetch as teacherFetch,
  teacherAttempt,
} from "@/features/activities/components/test-fixtures";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { routedFetch as studentFetch, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { renderWithProviders } from "./render";

const SCRIPT = `<script>alert("xss")</script><img src=x onerror="alert(1)">`;
const WEB_ROOT = resolve(__dirname, "..");
const SCANNED = ["features/activities", "features/student-activities", "components/ui/assessment"];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * 012/FR-035: what students and teachers write (answers, titles, feedback) holding `<script>` and
 * HTML renders as text on the student's and the teacher's screens, and no component of these
 * features sets HTML (`dangerouslySetInnerHTML`).
 */
describe("012/FR-035 conteúdo de aluno e professor como texto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("nenhum dangerouslySetInnerHTML nas telas da 012 e nos componentes de avaliação", () => {
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
      attempt: { startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [{ questionId: open!.id, answer: { kind: "TEXT", text: SCRIPT }, revision: 1 }] },
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
    const { container } = renderWithProviders(<AttemptReview classId={CLASS_ID} activityId={ACTIVITY_ID} attemptId={ATTEMPT_ID} canGrade={false} />);
    await screen.findByRole("heading", { name: "Tentativa de Bruno Lima" });
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByText(SCRIPT)).toBeTruthy();
  });
});
