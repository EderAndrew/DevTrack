import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivity, createClassWithStudents } from "../helpers/activities";
import { markAllPresent } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createUser, loginAs } from "../helpers/factories";
import { getAttemptGroup, getCandidates, startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const CANDIDATES_P95_MS = 100;
const ACTIVITY_P95_MS = 150;
const TEACHER_P95_MS = 150;
const CALLS = 40;
const CLASS_SIZE = 60;
const MEMBERS = 5;
const QUESTIONS = 10;
const SAVES_PER_QUESTION = 50;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 023 plan "Performance Goals", each call measured end to end through HTTP after a warm-up: the candidates of a
 * class of 60 p95 < 100 ms, a member's `GET /me/activities/:id` p95 < 150 ms, and the teacher's facts of a group of
 * 5 with 10 questions and 50 saves on each p95 < 150 ms.
 */
describe("023 desempenho do trabalho em grupo", () => {
  let t: TestApp;
  let leader: ReturnType<typeof api>;
  let candidateReader: ReturnType<typeof api>;
  let teacher: ReturnType<typeof api>;
  let classId: string;
  let activityId: string;
  let openActivityId: string;
  let attemptId: string;

  const measure = async (call: () => Promise<{ status: number; body: unknown }>) => {
    const durations: number[] = [];
    for (let i = -3; i < CALLS; i++) {
      const start = performance.now();
      const res = await call();
      const ms = performance.now() - start;
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      if (i >= 0) durations.push(ms);
    }
    return p95(durations);
  };

  beforeAll(async () => {
    t = await createTestApp({ clock: new FixedClock(new Date()), config: { rateLimit: { ...testConfig().rateLimit, activityTeacherWritesPerHour: 10_000 } } });
    await resetDb(t.prisma);
    const teacherUser = await createUser(t, { roles: ["TEACHER"] });
    teacher = api(t, { cookie: await loginAs(t, teacherUser) });
    const { schoolClass, students } = await createClassWithStudents(t, teacherUser.id, { students: CLASS_SIZE });
    classId = schoolClass.id;
    leader = api(t, { cookie: await loginAs(t, students[0]!) });
    candidateReader = api(t, { cookie: await loginAs(t, students[CLASS_SIZE - 1]!) });

    const questions = Array.from({ length: QUESTIONS }, () => ({ type: "OPEN_ANSWER" as const }));
    const work = await createActivity(t, schoolClass, { type: "ASSIGNMENT", releaseMode: "PRESENT_ONLY", groupSize: MEMBERS, questions });
    activityId = work.activity.id;
    await markAllPresent(teacher, classId, activityId);
    const memberIds = students.slice(1, MEMBERS).map((student) => student.id);
    const started = await startGroup(leader, activityId, memberIds);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId } })).id;

    const open = await createActivity(t, schoolClass, { type: "ASSIGNMENT", releaseMode: "PRESENT_ONLY", groupSize: MEMBERS, questions });
    openActivityId = open.activity.id;
    await markAllPresent(teacher, classId, openActivityId);

    const writers = [students[0]!.id, ...memberIds];
    const base = Date.now();
    await t.prisma.activityAnswerSave.createMany({
      data: work.questionIds.flatMap((questionId) =>
        Array.from({ length: SAVES_PER_QUESTION }, (_, index) => ({
          attemptId,
          questionId,
          revision: index + 1,
          studentUserId: writers[index % MEMBERS]!,
          savedAt: new Date(base + index * 1000),
        })),
      ),
    });
    await t.prisma.$executeRawUnsafe("ANALYZE activity_answer_saves");
  }, 300_000);
  afterAll(() => t.close());

  it(`023 candidatos de uma turma de ${CLASS_SIZE} p95 < ${CANDIDATES_P95_MS} ms`, async () => {
    const first = await getCandidates(candidateReader, openActivityId);
    expect(first.body.candidates).toHaveLength(CLASS_SIZE - 1);
    expect(await measure(() => getCandidates(candidateReader, openActivityId))).toBeLessThan(CANDIDATES_P95_MS);
  });

  it(`023 GET /me/activities/:id de um grupo p95 < ${ACTIVITY_P95_MS} ms`, async () => {
    expect(await measure(() => leader.get(`/api/me/activities/${activityId}`))).toBeLessThan(ACTIVITY_P95_MS);
  });

  it(`023 fatos do grupo com ${MEMBERS} integrantes × ${QUESTIONS} questões × ${SAVES_PER_QUESTION} salvamentos p95 < ${TEACHER_P95_MS} ms`, async () => {
    const first = await getAttemptGroup(teacher, classId, activityId, attemptId);
    expect(first.body.members).toHaveLength(MEMBERS);
    expect(first.body.saves).toHaveLength(QUESTIONS);
    expect(first.body.saves[0].entries).toHaveLength(SAVES_PER_QUESTION);
    expect(await measure(() => getAttemptGroup(teacher, classId, activityId, attemptId))).toBeLessThan(TEACHER_P95_MS);
  });
});
