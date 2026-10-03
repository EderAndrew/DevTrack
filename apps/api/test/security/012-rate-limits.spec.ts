import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, releaseResult, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const SAVES = 3;
const SUBMITS = 2;
const TEACHER_WRITES = 3;
const RATE_LIMITED = { statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) };

/**
 * 012 research P20: saves per minute and starts/submissions per hour per student, and the
 * teacher's writes (apply, edit, close, cancel, grade, accept, release) per hour per teacher.
 * Over the limit → 429 RATE_LIMITED with `Retry-After`, and nothing is written; another user's
 * counter is untouched.
 */
describe("012 limites de salvamento, entrega e escrita do professor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let created: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const student = async () => {
    const user = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, user.id);
    return { user, client: api(t, { cookie: await loginAs(t, user) }) };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({
      clock,
      config: {
        rateLimit: {
          ...testConfig().rateLimit,
          activitySavesPerMinute: SAVES,
          activitySubmitsPerHour: SUBMITS,
          activityTeacherWritesPerHour: TEACHER_WRITES,
        },
      },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    created = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
  });

  it("salvamentos acima do limite por minuto → 429 sem gravar; outro aluno segue salvando", async () => {
    const first = await student();
    const second = await student();
    const id = created.activity.id;
    const questionId = created.questionIds[0]!;
    await startAttempt(first.client, id);
    await startAttempt(second.client, id);
    for (let revision = 0; revision < SAVES; revision++) {
      expect((await saveAnswers(first.client, id, [{ questionId, answer: text(`versão ${revision + 1}`), baseRevision: revision }])).status).toBe(200);
    }
    const blocked = await saveAnswers(first.client, id, [{ questionId, answer: text("bloqueada"), baseRevision: SAVES }]);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual(RATE_LIMITED);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    const stored = await t.prisma.activityAnswer.findFirstOrThrow({ where: { attempt: { studentUserId: first.user.id } } });
    expect([stored.text, stored.revision]).toEqual([`versão ${SAVES}`, SAVES]);
    expect((await saveAnswers(second.client, id, [{ questionId, answer: text("outro"), baseRevision: 0 }])).status).toBe(200);
  });

  it("inícios e entregas acima do limite por hora → 429 sem registrar a entrega", async () => {
    const { user, client } = await student();
    const id = created.activity.id;
    expect((await startAttempt(client, id)).status).toBe(200);
    expect((await startAttempt(client, id)).status).toBe(200);
    const blocked = await submitAttempt(client, id, [{ questionId: created.questionIds[0]!, answer: text("x"), baseRevision: 0 }]);
    expect([blocked.status, blocked.body]).toEqual([429, RATE_LIMITED]);
    expect(await t.prisma.activitySubmission.count()).toBe(0);
    expect(await t.prisma.activityAnswer.count()).toBe(0);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { studentUserId: user.id } });
    expect(attempt.status).toBe("IN_PROGRESS");
  });

  it("escritas do professor acima do limite por hora → 429 sem mudar a atividade; outro professor não é afetado", async () => {
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const path = `/api/classes/${schoolClass.id}/activities/${created.activity.id}`;
    for (let version = 1; version <= TEACHER_WRITES; version++) {
      expect((await client.patch(path, { version, title: `Título ${version}` })).status).toBe(200);
    }
    const blocked = [
      await client.patch(path, { version: TEACHER_WRITES + 1, title: "Bloqueado" }),
      await client.post(`${path}/close`, {}),
      await releaseResult(client, schoolClass.id, created.activity.id),
    ];
    expect(blocked.map((res) => [res.status, res.body])).toEqual(blocked.map(() => [429, RATE_LIMITED]));
    const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: created.activity.id } });
    expect([stored.title, stored.status, stored.resultReleasedAt]).toEqual([`Título ${TEACHER_WRITES}`, "ACTIVE", null]);

    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClass = await createClass(t, other.id);
    const otherActivity = await createActivity(t, otherClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    expect((await otherClient.post(`/api/classes/${otherClass.id}/activities/${otherActivity.activity.id}/close`, {})).status).toBe(200);
  });
});
