import type { Answer, StudentActivity, StudentExerciseAttempt } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, type CreatedActivity, getExerciseAttempt, retryAttempt, saveAnswers, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

/** The answer-key fields a concluded attempt may show (research K10). */
const KEY_MARKERS = /MARCADOR-(RESPOSTA|SOLUCAO|EXPLICACAO)-013/;
/** Never shown to a student, before or after a conclusion: rubric, private test cases, teacher-only keys. */
const NEVER = /MARCADOR-(RUBRICA|PRIVADO)-013|isCorrect|gradingStrategy|"rubric"|isTrickQuestion|"visibility"|pendingReason/;
/** A grade, deadline or late rule anywhere in an EXERCISE response. */
const GRADE = /"grade"|"gradePartial"|"generalFeedback"|"late":true|REJECT|ACCEPT_LATE|ACCEPT_WITH_FLAG/;
/** The fields of each question of a concluded attempt, and nothing more (K10). */
const RESULT_KEYS = [
  "alreadyScored",
  "answer",
  "correctAlternativeId",
  "expectedAnswer",
  "expectedSolution",
  "explanation",
  "points",
  "position",
  "questionId",
  "result",
  "teacherComment",
].sort();

/**
 * 013/SC-001 013/SC-004 013/FR-011…FR-013 (research K10): an EXERCISE activity with markers in every
 * answer-key field (expected answer, rubric, solution, explanation, private test case) and a correct
 * alternative. Before a conclusion no student response carries any of it; after, only the session
 * student's concluded attempt does, through the K10 fields (never the rubric or a private test case);
 * a classmate who hasn't concluded still sees nothing; no response ever has a grade, deadline or late rule.
 */
describe("013/SC-004 gabarito do exercício só depois da conclusão, só da própria tentativa", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let created: CreatedActivity;
  let client: Client;
  let classmate: Client;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  const reads = async (who: Client) => {
    const id = created.activity.id;
    return [
      await who.get("/api/me/dashboard"),
      await who.get("/api/me/activities"),
      await who.get("/api/me/activities?status=COMPLETED"),
      await who.get(`/api/me/activities/${id}`),
      await who.get(`/api/me/classes/${schoolClass.id}/ranking`),
    ];
  };
  const scan = (situation: string, responses: { status: number; body: unknown }[], keyAllowed = false) => {
    for (const res of responses) {
      expect(res.status, situation).toBeLessThan(300);
      const body = JSON.stringify(res.body);
      expect(body, situation).not.toMatch(NEVER);
      expect(body, situation).not.toMatch(GRADE);
      if (!keyAllowed) {
        expect(body, situation).not.toMatch(KEY_MARKERS);
        expect(body, situation).not.toMatch(/correctAlternativeId|expectedAnswer|expectedSolution|explanation|teacherComment/);
      }
    }
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    const [student, other] = [await createUser(t, { roles: ["STUDENT"] }), await createUser(t, { roles: ["STUDENT"] })];
    await createEnrollment(t, schoolClass.id, student.id);
    await createEnrollment(t, schoolClass.id, other.id);
    client = api(t, { cookie: await loginAs(t, student) });
    classmate = api(t, { cookie: await loginAs(t, other) });
    created = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", difficulty: "BASIC", correctIndex: 2, explanation: "MARCADOR-EXPLICACAO-013", isTrickQuestion: true },
        {
          type: "OPEN_ANSWER",
          difficulty: "INTERMEDIATE",
          expectedAnswer: "MARCADOR-RESPOSTA-013",
          rubric: "MARCADOR-RUBRICA-013",
          explanation: "MARCADOR-EXPLICACAO-013",
        },
        {
          type: "CODE",
          difficulty: "ADVANCED",
          starterCode: "class Main {}",
          expectedSolution: "MARCADOR-SOLUCAO-013",
          explanation: "MARCADOR-EXPLICACAO-013",
          testCases: [
            { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" },
            { input: "MARCADOR-PRIVADO-013", expectedOutput: "MARCADOR-PRIVADO-013", visibility: "PRIVATE" },
          ],
        },
      ],
    });
  });

  it("013/SC-004 013/FR-011 antes da conclusão: nenhuma resposta do aluno traz gabarito, resultado, nota ou prazo", async () => {
    const { activity, questionIds, alternativeIds } = created;
    scan("pendente", await reads(client));

    const started = await startAttempt(client, activity.id);
    const saved = await saveAnswers(client, activity.id, [
      { questionId: questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: alternativeIds[0]![2]! }, baseRevision: 0 },
      { questionId: questionIds[1]!, answer: { kind: "TEXT", text: "Minha resposta" }, baseRevision: 0 },
    ]);
    scan("em andamento", [started, saved, ...(await reads(client))]);
    const view = started.body as StudentActivity;
    expect([view.deadline, view.latePolicy, view.totalGrade, view.submission, view.result, view.lastResult]).toEqual([null, null, null, null, null, null]);
    expect(view.questions.map((question) => question.value)).toEqual([null, null, null]);
    // Before any conclusion, no attempt is readable by number.
    expect((await getExerciseAttempt(client, activity.id, 1)).status).toBe(404);
  });

  it("013/SC-001 013/FR-012 013/FR-013 depois da conclusão: só a tentativa concluída do próprio aluno, pelos campos de K10", async () => {
    const { activity, questionIds, alternativeIds, correctAlternativeIds } = created;
    await startAttempt(client, activity.id);
    const answers: { questionId: string; answer: Answer; baseRevision: number }[] = [
      { questionId: questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: alternativeIds[0]![0]! }, baseRevision: 0 },
      { questionId: questionIds[1]!, answer: { kind: "TEXT", text: "Minha resposta" }, baseRevision: 0 },
    ];
    const done = await completeAttempt(client, activity.id, 1, answers);
    expect(done.status).toBe(200);
    const byNumber = await getExerciseAttempt(client, activity.id, 1);
    const view = await client.get(`/api/me/activities/${activity.id}`);
    scan("concluída", [done, byNumber, view, ...(await reads(client))], true);

    // The key reaches the student only through the concluded attempt, with exactly the K10 fields.
    for (const attempt of [byNumber.body, done.body.lastResult, view.body.lastResult] as StudentExerciseAttempt[]) {
      expect(JSON.stringify(attempt)).toMatch(KEY_MARKERS);
      for (const question of attempt.questions) expect(Object.keys(question).sort()).toEqual(RESULT_KEYS);
      const sorted = [...attempt.questions].sort((x, y) => x.position - y.position);
      expect(sorted.map((question) => question.correctAlternativeId)).toEqual([correctAlternativeIds[0], null, null]);
      expect(sorted.map((question) => question.expectedAnswer)).toEqual([null, "MARCADOR-RESPOSTA-013", null]);
      expect(sorted.map((question) => question.expectedSolution)).toEqual([null, null, "MARCADOR-SOLUCAO-013"]);
    }
    // Outside the attempt (questions, summaries, dashboard, ranking) nothing of the key.
    const { lastResult, ...rest } = view.body as StudentActivity;
    expect(lastResult).not.toBeNull();
    expect(JSON.stringify(rest)).not.toMatch(KEY_MARKERS);
    for (const res of [await client.get("/api/me/dashboard"), await client.get("/api/me/activities")]) expect(JSON.stringify(res.body)).not.toMatch(KEY_MARKERS);

    // The open practice attempt (2) shows the questions without the key; the concluded one stays readable.
    const retry = await retryAttempt(client, activity.id, 1);
    expect(retry.status).toBe(200);
    const { lastResult: kept, ...open } = retry.body as StudentActivity;
    expect(kept?.number).toBe(1);
    expect(JSON.stringify(open)).not.toMatch(KEY_MARKERS);
    expect((await getExerciseAttempt(client, activity.id, 2)).status).toBe(404);

    // A classmate who hasn't concluded sees nothing of the key nor of the other's attempt.
    scan("colega sem conclusão", await reads(classmate));
    expect((await getExerciseAttempt(classmate, activity.id, 1)).status).toBe(404);
    expect(JSON.stringify((await reads(classmate)).map((res) => res.body))).not.toContain("Minha resposta");
  });
});
