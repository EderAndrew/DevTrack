import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, gradeAttempt, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
/** Fields only the server decides (contracts/http-api.md): never accepted in a body. */
const SERVER_FIELDS = { studentUserId: crypto.randomUUID(), status: "SUBMITTED", submittedAt: START, late: false, grade: "1.00", value: "1.00", isCorrect: true };

/**
 * 012/FR-020 and the strict bodies of contracts/http-api.md: an unknown or server field in any body
 * → 400 (nothing written); answer and feedback sizes at and past their limits; 0, 1, 10 and 11
 * answers in one save.
 */
describe("012/FR-020 limites e campos do servidor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let schoolClass: SchoolClass;
  let created: CreatedActivity;
  let teacherClient: ReturnType<typeof api>;
  let client: ReturnType<typeof api>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });

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
    // Ten open answers (0,10 each) and one code question.
    created = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [...Array.from({ length: 9 }, () => ({ type: "OPEN_ANSWER" as const, valueCents: 10 })), { type: "CODE", valueCents: 10 }],
    });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("campo desconhecido ou do servidor em qualquer corpo → 400 e nada é gravado", async () => {
    const id = created.activity.id;
    const base = `/api/classes/${schoolClass.id}/activities`;
    const attemptPath = `${base}/${id}/attempts/${crypto.randomUUID()}`;
    const answer = { questionId: created.questionIds[0]!, answer: text("x"), baseRevision: 0 };
    const createBody = {
      idempotencyKey: crypto.randomUUID(),
      source: { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] },
      title: "Atividade",
      publishAt: null,
      acknowledgeOutOfScope: true,
    };
    const writes = [
      ["teacher", "POST", `${base}/scope-check`, { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] }],
      ["teacher", "POST", base, createBody],
      ["teacher", "PATCH", `${base}/${id}`, { version: 1, title: "Outro" }],
      ["teacher", "POST", `${base}/${id}/close`, {}],
      ["teacher", "POST", `${base}/${id}/cancel`, {}],
      ["teacher", "POST", `${base}/${id}/release`, {}],
      ["teacher", "PUT", `${attemptPath}/grades`, { version: 1, decisions: [] }],
      ["teacher", "POST", `${attemptPath}/accept-submission`, {}],
      ["student", "POST", `/api/me/activities/${id}/attempt`, {}],
      ["student", "PUT", `/api/me/activities/${id}/attempt/answers`, { answers: [answer] }],
      ["student", "POST", `/api/me/activities/${id}/attempt/submit`, { answers: [answer] }],
    ] as const;
    const send = (who: "teacher" | "student", method: string, path: string, body: object) => {
      const c = who === "teacher" ? teacherClient : client;
      return method === "PUT" ? c.put(path, body) : method === "PATCH" ? c.patch(path, body) : c.post(path, body);
    };
    for (const [who, method, path, body] of writes) {
      for (const [field, value] of Object.entries(SERVER_FIELDS)) {
        const res = await send(who, method, path, { ...body, [field]: value });
        expect({ path, field, status: res.status, code: res.body.code }).toEqual({ path, field, status: 400, code: "VALIDATION_ERROR" });
      }
    }
    // Inside an answer or a decision, too.
    for (const field of ["grade", "isCorrect", "revision", "studentUserId"]) {
      const res = await saveAnswers(client, id, [{ ...answer, [field]: true } as never]);
      expect({ field, status: res.status }).toEqual({ field, status: 400 });
    }
    for (const field of ["value", "isCorrect", "status"]) {
      const res = await teacherClient.put(`${attemptPath}/grades`, { version: 1, decisions: [{ questionId: created.questionIds[0], grade: "0.10", [field]: "x" }] });
      expect({ field, status: res.status }).toEqual({ field, status: 400 });
    }
    expect(await t.prisma.classActivity.count()).toBe(1);
    expect(await t.prisma.activityAttempt.count()).toBe(0);
    const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id } });
    expect([stored.status, stored.version, stored.resultReleasedAt]).toEqual(["ACTIVE", 1, null]);
  });

  it("012/FR-020 0 e 11 respostas num salvamento → 400; 1 e 10 → salvas", async () => {
    const id = created.activity.id;
    expect((await startAttempt(client, id)).status).toBe(200);
    const answers = created.questionIds.map((questionId, index) => ({
      questionId,
      answer: index === 9 ? ({ kind: "CODE", source: "class Main {}" } as Answer) : text(`Resposta ${index + 1}`),
      baseRevision: 0,
    }));
    expect((await saveAnswers(client, id, [])).status).toBe(400);
    expect((await saveAnswers(client, id, [...answers, { ...answers[0]!, questionId: crypto.randomUUID() }])).status).toBe(400);
    expect((await saveAnswers(client, id, answers.slice(0, 1))).body.results.map((r: { outcome: string }) => r.outcome)).toEqual(["SAVED"]);
    const ten = await saveAnswers(client, id, answers.map((item, index) => (index === 0 ? { ...item, baseRevision: 1 } : item)));
    expect(ten.status).toBe(200);
    expect(ten.body.results.map((r: { outcome: string }) => r.outcome)).toEqual(["UNCHANGED", ...Array(9).fill("SAVED")]);
    expect((await saveAnswers(client, id, [answers[1]!, answers[1]!])).status).toBe(400);
  });

  it("012/FR-020 texto até 20 000 e código até 100 000 caracteres; um a mais → 400", async () => {
    const id = created.activity.id;
    await startAttempt(client, id);
    const open = created.questionIds[0]!;
    const code = created.questionIds[9]!;
    expect((await saveAnswers(client, id, [{ questionId: open, answer: text("a".repeat(20_000)), baseRevision: 0 }])).status).toBe(200);
    expect((await saveAnswers(client, id, [{ questionId: open, answer: text("a".repeat(20_001)), baseRevision: 1 }])).status).toBe(400);
    expect((await saveAnswers(client, id, [{ questionId: code, answer: { kind: "CODE", source: "b".repeat(100_000) }, baseRevision: 0 }])).status).toBe(200);
    expect((await saveAnswers(client, id, [{ questionId: code, answer: { kind: "CODE", source: "b".repeat(100_001) }, baseRevision: 1 }])).status).toBe(400);
    // A text answer on a code question (or the reverse) is refused whole.
    expect((await saveAnswers(client, id, [{ questionId: code, answer: text("x"), baseRevision: 1 }])).body.code).toBe("INVALID_ANSWER");
  });

  it("feedback até 5 000 caracteres por questão e geral; um a mais → 400; título e instruções nos seus limites", async () => {
    const id = created.activity.id;
    await startAttempt(client, id);
    expect((await submitAttempt(client, id)).status).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id } });
    const grade = (feedback: string, generalFeedback: string) =>
      gradeAttempt(teacherClient, schoolClass.id, id, attempt.id, {
        version: 1,
        decisions: [{ questionId: created.questionIds[0]!, grade: "0.10", feedback }],
        generalFeedback,
      });
    expect((await grade("f".repeat(5_001), "ok")).status).toBe(400);
    expect((await grade("ok", "g".repeat(5_001))).status).toBe(400);
    expect((await grade("f".repeat(5_000), "g".repeat(5_000))).status).toBe(200);

    const patch = (body: object) => teacherClient.patch(`/api/classes/${schoolClass.id}/activities/${id}`, { version: 1, ...body });
    expect((await patch({ title: "t".repeat(201) })).status).toBe(400);
    expect((await patch({ instructions: "i".repeat(10_001) })).status).toBe(400);
    expect((await patch({ title: "t".repeat(200), instructions: "i".repeat(10_000) })).status).toBe(200);
  });
});
