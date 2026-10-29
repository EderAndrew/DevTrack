import type { Answer, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { createClassWithStudents, getAttempt, gradeAttempt, releaseResult, startAttempt, submitAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeWork, createRunWorker, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const RUNS = 50;
/** Who and when differ between the two students by construction; everything else must not. */
const VARYING = new Set(["id", "userId", "studentUserId", "attemptId", "name", "version"]);

/** The value without ids, names and server times (`…At`), recursively. */
function invariant(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(invariant);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !VARYING.has(key) && !key.endsWith("At"))
      .map(([key, child]) => [key, invariant(child)]),
  );
}

/**
 * 021/SC-003, FR-012: running code on a work is a draft. Two students give the same answers; one ran
 * nothing, the other ran 50 times (passing, failing, a compilation error) before submitting. The
 * submission, the automatic and the teacher's grading, the grade, the release and what each student
 * reads after it are identical, and no grading of the CODE question is prefilled by a run.
 */
describe("021/SC-003 executar 0 ou 50 vezes num Trabalho não muda entrega, correção, nota nem liberação", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherClient: Client;
  let students: TestUser[];
  let clients: Client[];
  let classId: string;
  let activityId: string;
  let questionIds: string[];
  let alternativeId: string;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, codeRunsPerMinute: 1_000 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    clients = await Promise.all(students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
    const work = await createCodeWork(t, created.schoolClass);
    activityId = work.activity.id;
    questionIds = work.questionIds;
    alternativeId = work.correctAlternativeIds[1]!;
    await seedHeartbeat(t, clock.now());
  });

  it("021/SC-003 021/FR-012 entrega, correção automática e do professor, nota, liberação e visão do aluno idênticas", async () => {
    for (const client of clients) expect((await startAttempt(client, activityId)).status).toBe(200);
    const sandbox = new FakeSandbox();
    const { worker } = createRunWorker(t, clock, { sandbox });
    const outcomes = [fakeCase({ stdout: "2\n" }), fakeCase({ stdout: "errado\n" }), fakeCase({ exitCode: 1, stderr: "erro" })];
    for (let index = 0; index < RUNS; index += 1) {
      if (index % 10 === 9) sandbox.failCompilation("SyntaxError");
      else sandbox.failCompilation(null).scriptCases(outcomes[index % 3]!);
      const res = await requestRun(clients[1]!, activityId, questionIds[0]!, `print(${index})`);
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      expect(await worker.runOnce()).toBe(1);
      clock.advance(1000);
      await seedHeartbeat(t, clock.now());
    }
    expect(await t.prisma.codeRun.count({ where: { studentUserId: students[1]!.id, status: "COMPLETED" } })).toBe(RUNS);
    expect(await t.prisma.codeRun.count({ where: { studentUserId: students[0]!.id } })).toBe(0);

    const answers: { questionId: string; answer: Answer; baseRevision: number }[] = [
      { questionId: questionIds[0]!, answer: { kind: "CODE", source: "print(int(input()) * 2)" }, baseRevision: 0 },
      { questionId: questionIds[1]!, answer: { kind: "ALTERNATIVE", alternativeId }, baseRevision: 0 },
    ];
    for (const client of clients) expect((await submitAttempt(client, activityId, answers)).status).toBe(200);

    const attemptIds = await Promise.all(
      students.map(async (student) => (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } })).id),
    );
    const teacherAttempt = async (attemptId: string) => {
      const res = await getAttempt(teacherClient, classId, activityId, attemptId);
      expect(res.status).toBe(200);
      return res.body;
    };

    // Before the teacher's grading: the CODE question is pending (no run prefills it), the rest equal.
    const before = await Promise.all(attemptIds.map(teacherAttempt));
    expect(invariant(before[1])).toEqual(invariant(before[0]));
    const codeGrading = before[1].submission.gradings.find((grading: { questionId: string }) => grading.questionId === questionIds[0]);
    expect(codeGrading).toMatchObject({ status: "PENDING_TEACHER", finalGrade: null, teacherGrade: null });

    for (const [index, attemptId] of attemptIds.entries()) {
      const res = await gradeAttempt(teacherClient, classId, activityId, attemptId, {
        version: before[index].submission.version,
        decisions: [{ questionId: questionIds[0]!, grade: "0.80", feedback: "Faltou tratar a entrada vazia." }],
        generalFeedback: "Bom trabalho.",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    const graded = await Promise.all(attemptIds.map(teacherAttempt));
    expect(invariant(graded[1])).toEqual(invariant(graded[0]));
    expect(graded[0].submission).toMatchObject({ grade: "1.80", gradePartial: false });

    expect((await releaseResult(teacherClient, classId, activityId)).status).toBe(200);
    const views = await Promise.all(clients.map(async (client) => (await client.get(`/api/me/activities/${activityId}`)).body));
    expect(invariant(views[1])).toEqual(invariant(views[0]));
    expect(views[0].result).toMatchObject({ grade: "1.80" });

    const detail = (await teacherClient.get(`/api/classes/${classId}/activities/${activityId}`)).body as TeacherActivity;
    expect(detail.roster).toHaveLength(2);
    expect(invariant(detail.roster[1])).toEqual(invariant(detail.roster[0]));
  });
});
