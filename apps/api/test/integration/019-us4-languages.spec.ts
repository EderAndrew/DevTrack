import type { ProgrammingLanguageList, StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeExercise, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 019/US4, FR-020 (research B5): which languages run is catalog data — `programming_languages.execution`,
 * seeded for `java`, `python` and `javascript`. A language without it never runs (NOT_SUPPORTED, a
 * forged request refused with nothing created); a language with it but no live worker serving its
 * profile is only UNAVAILABLE for now. The teacher's language list carries the key.
 */
describe("019/US4 linguagens com execução vêm do catálogo", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: Client;
  let schoolClass: { id: string; teacherId: string };

  const execution = async (activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status).toBe(200);
    return (res.body as StudentActivity).questions[0]!.execution;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    student = api(t, { cookie: await loginAs(t, created.students[0]!) });
    await seedHeartbeat(t, clock.now());
  });

  it("019/US4-1 019/FR-020 linguagem sem execução: sem \"Executar\" (NOT_SUPPORTED) e o pedido forjado é 409 sem execução criada", async () => {
    for (const languageKey of ["cpp", "typescript", "php"]) {
      const exercise = await createCodeExercise(t, schoolClass, { languageKey });
      expect((await startAttempt(student, exercise.activity.id)).status).toBe(200);
      expect(await execution(exercise.activity.id), languageKey).toEqual({ status: "NOT_SUPPORTED", languageVersion: null, convention: null, limits: null });
      const forged = await requestRun(student, exercise.activity.id, exercise.questionIds[0]!);
      expect(forged.status, languageKey).toBe(409);
      expect(forged.body).toMatchObject({ code: "CODE_RUN_NOT_AVAILABLE", details: { reason: "NOT_SUPPORTED" } });
    }
    expect(await t.prisma.codeRun.count()).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "code_run." } } })).toBe(0);
  });

  it("019/US4-1 perfil sem worker vivo é UNAVAILABLE, não NOT_SUPPORTED; com o worker, AVAILABLE", async () => {
    await t.prisma.codeRunnerHeartbeat.deleteMany();
    await seedHeartbeat(t, clock.now(), { executions: ["python"] });
    const java = await createCodeExercise(t, schoolClass, { languageKey: "java" });
    expect((await startAttempt(student, java.activity.id)).status).toBe(200);
    expect(await execution(java.activity.id)).toEqual({ status: "UNAVAILABLE", languageVersion: null, convention: "JAVA_MAIN_CLASS", limits: null });
    const refused = await requestRun(student, java.activity.id, java.questionIds[0]!);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CODE_RUNNER_UNAVAILABLE");

    await seedHeartbeat(t, clock.now(), { workerId: "worker-java", executions: ["java"] });
    expect(await execution(java.activity.id)).toMatchObject({ status: "AVAILABLE", languageVersion: "Java 25" });
  });

  it("019/US4-2 019/FR-020 GET /programming-languages traz a chave de execução de cada linguagem do catálogo", async () => {
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const res = await teacherClient.get("/api/programming-languages");
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries((res.body as ProgrammingLanguageList).map((language) => [language.key, language.execution]));
    expect(Object.entries(byKey).filter(([, key]) => key !== null).sort()).toEqual([
      ["java", "java"],
      ["javascript", "javascript"],
      ["python", "python"],
    ]);
    for (const key of ["c", "cpp", "go", "php", "rust", "typescript", "html-css"]) expect(byKey[key], key).toBeNull();
  });
});
