import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ClassActivityType, SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, gradeAttempt, releaseResult, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork } from "../helpers/works";

const START = "2026-10-01T12:00:00.000Z";
const ANSWER_KEY_MARKERS = /MARCADOR-(RESPOSTA|RUBRICA|SOLUCAO|PRIVADO|EXPLICACAO)-012/;
/** Teacher-only fields and the pending reasons, as keys or values. */
const TEACHER_ONLY = /isCorrect|gradingStrategy|expectedAnswer|expectedSolution|rubric|explanation|isTrickQuestion|pendingReason|AI_REVIEW_UNAVAILABLE|NO_TEST_CASES|"visibility"/;
const FEEDBACK = "FEEDBACK-DO-PROFESSOR-012";
/** A grade or feedback anywhere (the `totalGrade` of the activity is public). */
const RESULT = new RegExp(`"grade"|"result":\\{|${FEEDBACK}|generalFeedback`);

/**
 * 012/SC-003 012/SC-004 (research P15): activities of both types carry markers in every answer-key
 * field (expected answer, rubric, solution, explanation, private test cases) and the correct
 * alternative. Every student response, in every situation — pending, in progress, submitted,
 * graded but not released, released — has none of them, nor `isCorrect`, the strategy, the pending
 * reasons or a private test case; the grade and the feedback appear only after the release.
 */
describe("012/SC-003 012/SC-004 visão do aluno sem gabarito", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  async function activityOf(type: ClassActivityType): Promise<CreatedActivity> {
    const source =
      type === "ASSIGNMENT"
        ? await (async () => {
            const syllabus = await createConfirmedSyllabus(t, teacher.id);
            const work = await createWork(t, teacher.id, { syllabus });
            return { sourceWorkId: work.id, sourceSubjectId: syllabus.subject.id };
          })()
        : {};
    return createActivity(t, schoolClass, {
      type,
      ...source,
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 30, correctIndex: 2, explanation: "MARCADOR-EXPLICACAO-012", isTrickQuestion: true },
        { type: "OPEN_ANSWER", valueCents: 40, expectedAnswer: "MARCADOR-RESPOSTA-012", rubric: "MARCADOR-RUBRICA-012", explanation: "MARCADOR-EXPLICACAO-012" },
        {
          type: "CODE",
          valueCents: 30,
          starterCode: "class Main {}",
          expectedSolution: "MARCADOR-SOLUCAO-012",
          explanation: "MARCADOR-EXPLICACAO-012",
          testCases: [
            { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" },
            { input: "MARCADOR-PRIVADO-012", expectedOutput: "MARCADOR-PRIVADO-012", visibility: "PRIVATE" },
          ],
        },
      ],
    });
  }

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"] });
    schoolClass = await createClass(t, teacher.id);
    await createEnrollment(t, schoolClass.id, student.id);
  });

  for (const type of ["ASSIGNMENT", "EXERCISE"] as const) {
    it(`012/SC-003 ${type}: nenhuma resposta do aluno traz gabarito, em nenhuma situação; nota só depois da liberação`, async () => {
      const created = await activityOf(type);
      const { activity, questionIds, alternativeIds } = created;
      const client = api(t, { cookie: await loginAs(t, student) });
      const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
      const reads = async () => [
        await client.get("/api/me/dashboard"),
        await client.get("/api/me/activities"),
        await client.get("/api/me/activities?status=COMPLETED"),
        await client.get(`/api/me/activities/${activity.id}`),
      ];
      const scan = (situation: string, responses: { status: number; body: unknown }[], released = false) => {
        for (const res of responses) {
          expect(res.status, situation).toBe(200);
          const body = JSON.stringify(res.body);
          expect(body, situation).not.toMatch(ANSWER_KEY_MARKERS);
          expect(body, situation).not.toMatch(TEACHER_ONLY);
          if (!released) expect(body, situation).not.toMatch(RESULT);
        }
      };

      scan("pendente", await reads());

      const started = await startAttempt(client, activity.id);
      const choice: Answer = { kind: "ALTERNATIVE", alternativeId: alternativeIds[0]![2]! };
      const saved = await saveAnswers(client, activity.id, [
        { questionId: questionIds[0]!, answer: choice, baseRevision: 0 },
        { questionId: questionIds[1]!, answer: { kind: "TEXT", text: "Minha resposta" }, baseRevision: 0 },
      ]);
      scan("em andamento", [started, saved, ...(await reads())]);

      if (type === "EXERCISE") {
        // Since 013 an Exercise is concluded, never submitted, graded or released: the answer key
        // after a conclusion is 013's (013-student-view.spec.ts). Submitting is refused, without a key.
        const refused = await submitAttempt(client, activity.id);
        expect([refused.status, refused.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
        expect(JSON.stringify(refused.body)).not.toMatch(ANSWER_KEY_MARKERS);
        scan("entrega recusada", await reads());
        return;
      }

      const submitted = await submitAttempt(client, activity.id, [
        { questionId: questionIds[2]!, answer: { kind: "CODE", source: "class Main { }" }, baseRevision: 0 },
      ]);
      scan("entregue", [submitted, await submitAttempt(client, activity.id), ...(await reads())]);

      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
      const graded = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attempt.id, {
        version: 1,
        decisions: [
          { questionId: questionIds[1]!, grade: "0.40", feedback: FEEDBACK },
          { questionId: questionIds[2]!, grade: "0.10", feedback: FEEDBACK },
        ],
        generalFeedback: FEEDBACK,
      });
      expect(graded.status).toBe(200);
      scan("corrigida e não liberada", [await startAttempt(client, activity.id), ...(await reads())]);

      expect((await releaseResult(teacherClient, schoolClass.id, activity.id)).status).toBe(200);
      const released = await reads();
      scan("liberada", released, true);
      const view = released[3]!.body;
      expect(view.status).toBe("GRADED");
      expect(view.result.grade).toBe("0.80");
      expect(JSON.stringify(view)).toContain(FEEDBACK);
      // The public test case reaches the student; the private one never does.
      const code = view.questions.find((question: { type: string }) => question.type === "CODE");
      expect(code.publicTestCases).toEqual([{ input: "1 2", expectedOutput: "3" }]);
    });
  }
});
