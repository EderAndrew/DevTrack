import { randomUUID } from "node:crypto";
import type { TeacherActivity, WorkTeacherView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ActivityStateMachine } from "../../src/modules/activities/activity.state-machine";
import { applyExercises, applyWork, createClassWithStudents, createCompletedTopics, FAR_DEADLINE } from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createClass, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, toUpdateBody, type WorkFixture } from "../helpers/works";

/**
 * 012/US1 — the teacher applies an APPROVED work or 1–10 APPROVED exercises of their bank to their
 * class: a snapshot of the content, publication date, deadline and late policy, the taught scope
 * flagged and confirmed, then edits, closes and cancels it (012/FR-001…FR-005a). The student side of
 * a scheduled activity (not listed, not opened by id) is checked with the student routes (012/US2,
 * T026); here the server decides the phase by its clock.
 */

const START = "2026-10-01T12:00:00.000Z";
const iso = (clock: FixedClock, offset: number) => new Date(clock.now().getTime() + offset).toISOString();

describe("012/US1 professor aplica e publica uma atividade para a turma", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let syllabus: ConfirmedSyllabus;
  let classId: string;
  let work: WorkFixture;

  const base = () => `/api/classes/${classId}/activities`;
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A work of three types, each question on one item of the syllabus (positions 0, 1, 2). */
  const mixedWork = (status: "APPROVED" | "DRAFT" | "ARCHIVED" = "APPROVED") =>
    createWork(t, teacher.id, {
      syllabus,
      status,
      totalGrade: "1.00",
      topicItemIds: syllabus.itemIds.slice(0, 3),
      questions: [
        { type: "OPEN_ANSWER", topicItemIds: [syllabus.itemIds[0]!], rubric: "Cita superclasse." },
        { type: "MULTIPLE_CHOICE", topicItemIds: [syllabus.itemIds[1]!] },
        { type: "CODE", topicItemIds: [syllabus.itemIds[2]!] },
      ],
    });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    classId = (await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 })).schoolClass.id;
    // Every item of the work is taught, unless a test says otherwise.
    await createCompletedTopics(t, classId, syllabus.revision.id, syllabus.itemIds.slice(0, 3));
    work = await mixedWork();
  });

  it("012/US1-1 012/FR-001 aplica um trabalho APPROVED com publicação imediata: 201, cópia completa e activity.published", async () => {
    const res = await applyWork(client, classId, work.id, { deadline: iso(clock, 7 * DAY), latePolicy: "ACCEPT_MARKED" });
    expect(res.status).toBe(201);
    const activity = res.body as TeacherActivity;
    expect(activity).toMatchObject({
      type: "ASSIGNMENT",
      executionMode: "NORMAL",
      status: "ACTIVE",
      phase: "PUBLISHED",
      publishAt: START,
      latePolicy: "ACCEPT_MARKED",
      totalGrade: "1.00",
      version: 1,
      outOfScopeTopicCount: 0,
      source: { workId: work.id },
      resultReleasedAt: null,
      counts: { enrolled: 2, inProgress: 0, submitted: 0, submittedLate: 0, missed: 0, pendingGrading: 0 },
    });
    // The create's view is read before any attendance: a work applied since 016 is PRESENT_ONLY, so
    // the class is "Ausente" until the teacher marks it (016/FR-019).
    expect(activity.roster.map((entry) => [entry.enrollment, entry.status, entry.attemptId])).toEqual([
      ["ACTIVE", "ABSENT", null],
      ["ACTIVE", "ABSENT", null],
    ]);
    // 012/FR-002: questions, values, answer key, strategies, test cases and topics copied.
    expect(activity.questions.map((q) => [q.position, q.type, q.gradingStrategy, q.value])).toEqual([
      [0, "OPEN_ANSWER", "AI_REVIEW", "0.34"],
      [1, "MULTIPLE_CHOICE", "EXACT_MATCH", "0.33"],
      [2, "CODE", "TEST_CASES", "0.33"],
    ]);
    const [open, choice, code] = activity.questions;
    expect(open).toMatchObject({ expectedAnswer: "Resposta esperada", rubric: "Cita superclasse.", explanation: "Explicação de teste" });
    expect(open!.topics).toEqual([{ syllabusItemId: syllabus.itemIds[0], title: expect.any(String) }]);
    expect(choice!.alternatives.map((a) => [a.position, a.text, a.isCorrect])).toEqual([
      [0, "Alternativa correta", true],
      [1, "Distrator um", false],
      [2, "Distrator dois", false],
    ]);
    expect(code).toMatchObject({ expectedSolution: "class Solucao {}", language: { name: expect.any(String) } });
    expect(code!.testCases.map((c) => c.visibility)).toEqual(["PUBLIC", "PRIVATE"]);

    const [published] = await events("activity.published");
    expect(published).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS_ACTIVITY", targetId: activity.id });
    expect(published!.metadata).toEqual({
      classId,
      type: "ASSIGNMENT",
      executionMode: "NORMAL",
      // 015: the work's AI help, none unless the teacher turns it on.
      aiHelpAllowance: 0,
      sourceWorkId: work.id,
      questionCount: 3,
      totalCents: 100,
      latePolicy: "ACCEPT_MARKED",
      scheduled: false,
      outOfScopeTopicCount: 0,
      hasPlan: true,
      // 016: every work applied since 016 takes attendance (research M2).
      releaseMode: "PRESENT_ONLY",
    });
  });

  it("012/US1-2 012/FR-002 editar e arquivar o trabalho no banco não muda a atividade aplicada", async () => {
    const applied = (await applyWork(client, classId, work.id)).body as TeacherActivity;
    const before = (await client.get(`${base()}/${applied.id}`)).body as TeacherActivity;

    const view = (await client.get(`/api/works/${work.id}`)).body as WorkTeacherView;
    const body = toUpdateBody(view);
    body.questions[1] = { ...body.questions[1]!, statement: "Enunciado mudado no banco" } as (typeof body.questions)[number];
    const edited = await client.put(`/api/works/${work.id}`, { ...body, title: "Trabalho editado", totalGrade: "9.00" });
    expect(edited.status).toBe(200);
    expect((await client.post(`/api/works/${work.id}/archive`, { version: edited.body.version })).status).toBe(200);

    const after = (await client.get(`${base()}/${applied.id}`)).body as TeacherActivity;
    expect(after).toEqual(before);
    expect(after.questions[1]!.statement).not.toBe("Enunciado mudado no banco");
  });

  it("012/US1-3 item DRAFT ou ARCHIVED → 422 SOURCE_NOT_APPROVED; de outro professor ou turma de outro professor → 404", async () => {
    for (const status of ["DRAFT", "ARCHIVED"] as const) {
      const other = await mixedWork(status);
      const res = await applyWork(client, classId, other.id);
      expect(res.status, status).toBe(422);
      expect(res.body.code).toBe("SOURCE_NOT_APPROVED");
    }
    const draftExercise = await createExercise(t, teacher.id, { status: "DRAFT" });
    const approvedExercise = await createExercise(t, teacher.id);
    const draftRes = await applyExercises(client, classId, [approvedExercise.id, draftExercise.id]);
    expect([draftRes.status, draftRes.body.code]).toEqual([422, "SOURCE_NOT_APPROVED"]);

    const stranger = await createUser(t, { roles: ["TEACHER"] });
    const strangersWork = await createWork(t, stranger.id);
    const strangersExercise = await createExercise(t, stranger.id);
    expect((await applyWork(client, classId, strangersWork.id)).status).toBe(404);
    expect((await applyExercises(client, classId, [approvedExercise.id, strangersExercise.id])).status).toBe(404);
    expect((await client.post(`${base()}/scope-check`, { type: "ASSIGNMENT", workId: strangersWork.id })).status).toBe(404);

    const strangersClass = await createClass(t, stranger.id, { subjectId: syllabus.subject.id });
    const intoStrangersClass = await client.post(`/api/classes/${strangersClass.id}/activities`, {
      idempotencyKey: randomUUID(),
      source: { type: "ASSIGNMENT", workId: work.id },
      title: "Na turma alheia",
      publishAt: null,
      deadline: iso(clock, DAY),
      latePolicy: "REJECT",
      acknowledgeOutOfScope: true,
    });
    expect(intoStrangersClass.status).toBe(404);
    expect((await client.get(`/api/classes/${strangersClass.id}/activities`)).status).toBe(404);
    expect(await t.prisma.classActivity.count()).toBe(0);
    expect(await events("activity.published")).toEqual([]);
  });

  it("012/US1-4 012/FR-004 agendada para amanhã fica SCHEDULED até a data, pelo relógio do servidor", async () => {
    const res = await applyWork(client, classId, work.id, { publishAt: iso(clock, DAY), deadline: iso(clock, 3 * DAY) });
    expect(res.status).toBe(201);
    expect(res.body.phase).toBe("SCHEDULED");
    expect((await events("activity.published"))[0]!.metadata).toMatchObject({ scheduled: true });
    const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(ActivityStateMachine.isVisibleToStudents(stored.status, stored.publishAt, clock.now())).toBe(false);

    clock.advance(DAY - 1);
    expect((await client.get(`${base()}/${res.body.id}`)).body.phase).toBe("SCHEDULED");
    clock.advance(1);
    expect((await client.get(`${base()}/${res.body.id}`)).body.phase).toBe("PUBLISHED");
    expect(ActivityStateMachine.isVisibleToStudents(stored.status, stored.publishAt, clock.now())).toBe(true);
  });

  it("012/US1-5 012/FR-005 prazo que não vem depois da publicação é recusado", async () => {
    // Both dates in the body: the shared contract refuses it before the server.
    const sameInstant = await applyWork(client, classId, work.id, { publishAt: iso(clock, DAY), deadline: iso(clock, DAY) });
    expect([sameInstant.status, sameInstant.body.code]).toEqual([400, "VALIDATION_ERROR"]);
    // "Publicar agora": the server's now is the publication.
    const pastDeadline = await applyWork(client, classId, work.id, { publishAt: null, deadline: iso(clock, -HOUR) });
    expect([pastDeadline.status, pastDeadline.body.code]).toEqual([422, "INVALID_SCHEDULE"]);
    const atNow = await applyWork(client, classId, work.id, { publishAt: null, deadline: iso(clock, 0) });
    expect([atNow.status, atNow.body.code]).toEqual([422, "INVALID_SCHEDULE"]);

    const scheduled = (await applyWork(client, classId, work.id, { publishAt: iso(clock, 2 * DAY), deadline: iso(clock, 3 * DAY) })).body;
    const earlier = await client.patch(`${base()}/${scheduled.id}`, { version: 1, deadline: iso(clock, DAY) });
    expect([earlier.status, earlier.body.code]).toEqual([422, "INVALID_SCHEDULE"]);
    const later = await client.patch(`${base()}/${scheduled.id}`, { version: 1, publishAt: iso(clock, 4 * DAY) });
    expect([later.status, later.body.code]).toEqual([422, "INVALID_SCHEDULE"]);
    expect(await t.prisma.classActivity.count()).toBe(1);
  });

  it("012/US1-6 012/FR-005 o mesmo pedido duas vezes (clique duplo) cria uma atividade só", async () => {
    const idempotencyKey = randomUUID();
    const first = await applyWork(client, classId, work.id, { idempotencyKey });
    const again = await applyWork(client, classId, work.id, { idempotencyKey });
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.body.id).toBe(first.body.id);

    const raceKey = randomUUID();
    const race = await Promise.all([1, 2, 3].map(() => applyWork(client, classId, work.id, { idempotencyKey: raceKey })));
    expect(race.map((res) => res.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(race.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.classActivity.count()).toBe(2);
    expect(await events("activity.published")).toHaveLength(2);
  });

  // 012/US1-7 (a grade split among the exercises) was replaced by 013/US1-1 and 013/FR-001 (spec
  // 013, amendment of 012): an Exercise has no grade, deadline or late policy, only fixed points by
  // difficulty. The scenario keeps its id and now checks the replacement; 013-us1-apply.spec.ts has the rest.
  it("012/US1-7 013/US1-1 3 exercícios na ordem escolhida, sem nota: pontos pelo nível e nota total recusada", async () => {
    const open = await createExercise(t, teacher.id, { type: "OPEN_ANSWER", difficulty: "ADVANCED", syllabusItemId: syllabus.itemIds[0]! });
    const choice = await createExercise(t, teacher.id, { difficulty: "BASIC", syllabusItemId: syllabus.itemIds[1]! });
    const code = await createExercise(t, teacher.id, { type: "CODE", difficulty: "INTERMEDIATE", syllabusItemId: syllabus.itemIds[2]! });
    const order = [code.id, open.id, choice.id];

    const res = await applyExercises(client, classId, order);
    expect(res.status).toBe(201);
    const activity = res.body as TeacherActivity;
    expect(activity).toMatchObject({ type: "EXERCISE", totalGrade: null, deadline: null, latePolicy: null, possiblePoints: 105, source: { exerciseIds: order } });
    expect(activity.questions.map((q) => [q.type, q.gradingStrategy, q.value, q.difficulty, q.points])).toEqual([
      ["CODE", "TEST_CASES", null, "INTERMEDIATE", 30],
      ["OPEN_ANSWER", "AI_REVIEW", null, "ADVANCED", 60],
      ["MULTIPLE_CHOICE", "EXACT_MATCH", null, "BASIC", 15],
    ]);
    // Exercises carry no rubric and no test cases (research P2); the topic is the exercise's item.
    expect(activity.questions[0]!.testCases).toEqual([]);
    expect(activity.questions[1]!.rubric).toBeNull();
    expect(activity.questions.map((q) => q.topics.map((topic) => topic.syllabusItemId))).toEqual([
      [syllabus.itemIds[2]],
      [syllabus.itemIds[0]],
      [syllabus.itemIds[1]],
    ]);
    expect((await events("activity.published"))[0]!.metadata).toMatchObject({ type: "EXERCISE", sourceExerciseCount: 3, possiblePoints: 105 });

    for (const field of [{ totalGrade: "1.00" }, { deadline: FAR_DEADLINE }, { latePolicy: "REJECT" as const }]) {
      const refused = await applyExercises(client, classId, order, field);
      expect([refused.status, refused.body.code], JSON.stringify(field)).toEqual([400, "VALIDATION_ERROR"]);
    }
    expect((await applyWork(client, classId, work.id, { totalGrade: "5.00" })).status).toBe(400);
    const eleven = Array.from({ length: 11 }, () => randomUUID());
    expect((await applyExercises(client, classId, eleven)).status).toBe(400);
    expect((await applyExercises(client, classId, [open.id, open.id])).status).toBe(400);
  });

  it("012/US1-8 012/FR-024a a regra de atraso fica registrada na atividade e muda enquanto ela está ativa", async () => {
    const rejecting = (await applyWork(client, classId, work.id, { latePolicy: "REJECT" })).body as TeacherActivity;
    const accepting = (await applyWork(client, classId, work.id, { latePolicy: "ACCEPT_MARKED" })).body as TeacherActivity;
    expect([rejecting.latePolicy, accepting.latePolicy]).toEqual(["REJECT", "ACCEPT_MARKED"]);
    const stored = await t.prisma.classActivity.findMany({ orderBy: { createdAt: "asc" }, select: { latePolicy: true } });
    expect(stored.map((row) => row.latePolicy).sort()).toEqual(["ACCEPT_MARKED", "REJECT"]);

    const changed = await client.patch(`${base()}/${rejecting.id}`, { version: 1, latePolicy: "ACCEPT_MARKED" });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ latePolicy: "ACCEPT_MARKED", version: 2 });
  });

  describe("012/FR-005a escopo ensinado e disciplina", () => {
    it("012/FR-005a scope-check sinaliza os tópicos ainda não concluídos, com as posições; turma sem plano → tudo fora", async () => {
      const partly = await createWork(t, teacher.id, {
        syllabus,
        topicItemIds: [syllabus.itemIds[0]!, syllabus.itemIds[3]!, syllabus.itemIds[4]!],
        questions: [
          { type: "MULTIPLE_CHOICE", topicItemIds: [syllabus.itemIds[0]!] },
          { type: "MULTIPLE_CHOICE", topicItemIds: [syllabus.itemIds[3]!, syllabus.itemIds[4]!] },
          { type: "OPEN_ANSWER", topicItemIds: [syllabus.itemIds[3]!] },
        ],
      });
      const check = await client.post(`${base()}/scope-check`, { type: "ASSIGNMENT", workId: partly.id });
      expect(check.status).toBe(200);
      expect(check.body.hasPlan).toBe(true);
      expect(check.body.outOfScope.map((item: { syllabusItemId: string; questionPositions: number[] }) => [item.syllabusItemId, item.questionPositions])).toEqual([
        [syllabus.itemIds[3], [1, 2]],
        [syllabus.itemIds[4], [1]],
      ]);
      expect(check.body.outOfScope[0].title).toEqual(expect.any(String));
      expect((await client.post(`${base()}/scope-check`, { type: "ASSIGNMENT", workId: work.id })).body).toEqual({ hasPlan: true, outOfScope: [] });

      const planless = (await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id })).schoolClass.id;
      const noPlan = await client.post(`/api/classes/${planless}/activities/scope-check`, { type: "ASSIGNMENT", workId: work.id });
      expect(noPlan.body.hasPlan).toBe(false);
      expect(noPlan.body.outOfScope).toHaveLength(3);
      const exercise = await createExercise(t, teacher.id, { syllabusItemId: syllabus.itemIds[4]! });
      const exercises = await client.post(`${base()}/scope-check`, { type: "EXERCISE", exerciseIds: [exercise.id] });
      expect(exercises.body.outOfScope.map((item: { syllabusItemId: string }) => item.syllabusItemId)).toEqual([syllabus.itemIds[4]]);
    });

    it("012/FR-005a tópicos fora do escopo sem confirmação → 422; com confirmação → criada com outOfScopeTopicCount", async () => {
      const ahead = await createWork(t, teacher.id, {
        syllabus,
        topicItemIds: [syllabus.itemIds[3]!, syllabus.itemIds[4]!],
        questions: [{ type: "MULTIPLE_CHOICE", topicItemIds: [syllabus.itemIds[3]!, syllabus.itemIds[4]!] }],
      });
      const refused = await applyWork(client, classId, ahead.id, { acknowledgeOutOfScope: false });
      expect([refused.status, refused.body.code]).toEqual([422, "OUT_OF_SCOPE_NOT_ACKNOWLEDGED"]);
      expect(await t.prisma.classActivity.count()).toBe(0);

      const accepted = await applyWork(client, classId, ahead.id, { acknowledgeOutOfScope: true });
      expect(accepted.status).toBe(201);
      expect(accepted.body.outOfScopeTopicCount).toBe(2);
      expect((await events("activity.published"))[0]!.metadata).toMatchObject({ outOfScopeTopicCount: 2, hasPlan: true });
    });

    it("012/FR-005a um trabalho só vai para turma da mesma disciplina → 422 SUBJECT_MISMATCH", async () => {
      const otherSyllabus = await createConfirmedSyllabus(t, teacher.id);
      const otherWork = await createWork(t, teacher.id, { syllabus: otherSyllabus });
      const mismatch = await applyWork(client, classId, otherWork.id, { acknowledgeOutOfScope: true });
      expect([mismatch.status, mismatch.body.code]).toEqual([422, "SUBJECT_MISMATCH"]);
      const check = await client.post(`${base()}/scope-check`, { type: "ASSIGNMENT", workId: otherWork.id });
      expect([check.status, check.body.code]).toEqual([422, "SUBJECT_MISMATCH"]);

      const noSubject = (await createClassWithStudents(t, teacher.id, { subjectId: null })).schoolClass.id;
      const intoNoSubject = await applyWork(client, noSubject, work.id, { acknowledgeOutOfScope: true });
      expect(intoNoSubject.body.code).toBe("SUBJECT_MISMATCH");
      // Exercises have no subject: only the scope flag applies (research P5).
      const exercise = await createExercise(t, teacher.id, { syllabusItemId: otherSyllabus.itemIds[0]! });
      expect((await applyExercises(client, noSubject, [exercise.id], { acknowledgeOutOfScope: true })).status).toBe(201);
    });
  });

  it("012/FR-001 turma INACTIVE → 409 CLASS_NOT_ACTIVE", async () => {
    await t.prisma.schoolClass.update({ where: { id: classId }, data: { status: "INACTIVE", statusChangedAt: new Date() } });
    const res = await applyWork(client, classId, work.id);
    expect([res.status, res.body.code]).toEqual([409, "CLASS_NOT_ACTIVE"]);
  });

  describe("012/FR-004 edição, encerramento e cancelamento", () => {
    it("012/FR-004 PATCH muda título, instruções, prazo e regra, com a versão; publicação só enquanto agendada", async () => {
      const scheduled = (await applyWork(client, classId, work.id, { publishAt: iso(clock, DAY), deadline: iso(clock, 3 * DAY) })).body;
      const edited = await client.patch(`${base()}/${scheduled.id}`, {
        version: 1,
        title: "Lista revisada",
        instructions: "Novas instruções",
        publishAt: iso(clock, 2 * DAY),
        deadline: iso(clock, 5 * DAY),
        latePolicy: "ACCEPT_MARKED",
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({
        title: "Lista revisada",
        instructions: "Novas instruções",
        publishAt: iso(clock, 2 * DAY),
        deadline: iso(clock, 5 * DAY),
        latePolicy: "ACCEPT_MARKED",
        version: 2,
      });
      const [updated] = await events("activity.updated");
      expect(updated!.metadata).toEqual({ classId, fields: ["deadline", "instructions", "latePolicy", "publishAt", "title"] });

      // Nothing changed: the activity as it is, no event, no new version.
      const same = await client.patch(`${base()}/${scheduled.id}`, { version: 2, title: "Lista revisada" });
      expect([same.status, same.body.version]).toEqual([200, 2]);
      expect(await events("activity.updated")).toHaveLength(1);

      const stale = await client.patch(`${base()}/${scheduled.id}`, { version: 1, title: "Outra" });
      expect([stale.status, stale.body.code]).toEqual([409, "ACTIVITY_VERSION_CONFLICT"]);

      clock.advance(2 * DAY);
      const published = await client.patch(`${base()}/${scheduled.id}`, { version: 2, publishAt: iso(clock, DAY) });
      expect([published.status, published.body.code]).toEqual([422, "ALREADY_PUBLISHED"]);
      expect((await client.patch(`${base()}/${scheduled.id}`, { version: 2, deadline: iso(clock, 6 * DAY) })).status).toBe(200);
    });

    it("012/FR-004 encerrar e cancelar: transições válidas, no-ops e inválidas", async () => {
      const activity = (await applyWork(client, classId, work.id)).body as TeacherActivity;
      const closed = await client.post(`${base()}/${activity.id}/close`, {});
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ status: "CLOSED", phase: null });
      expect((await events("activity.closed"))[0]!.metadata).toEqual({ classId, submittedCount: 0, missedCount: 2, pausedCount: 0 });
      expect((await client.post(`${base()}/${activity.id}/close`, {})).status).toBe(200);
      expect(await events("activity.closed")).toHaveLength(1);

      const edit = await client.patch(`${base()}/${activity.id}`, { version: closed.body.version, title: "Depois de encerrada" });
      expect([edit.status, edit.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

      const cancelled = await client.post(`${base()}/${activity.id}/cancel`, {});
      expect(cancelled.body.status).toBe("CANCELLED");
      expect((await events("activity.cancelled"))[0]!.metadata).toEqual({ classId, from: "CLOSED", submittedCount: 0, pausedCount: 0 });
      expect((await client.post(`${base()}/${activity.id}/cancel`, {})).status).toBe(200);
      expect(await events("activity.cancelled")).toHaveLength(1);
      const reopen = await client.post(`${base()}/${activity.id}/close`, {});
      expect([reopen.status, reopen.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);

      const active = (await applyWork(client, classId, work.id)).body as TeacherActivity;
      expect((await client.post(`${base()}/${active.id}/cancel`, {})).body.status).toBe("CANCELLED");
      expect((await events("activity.cancelled"))[1]!.metadata).toMatchObject({ from: "ACTIVE" });
    });
  });

  it("012/FR-006 a lista da turma traz todas as situações por prazo decrescente; atividade de outra turma → 404", async () => {
    const soon = (await applyWork(client, classId, work.id, { deadline: iso(clock, DAY) })).body as TeacherActivity;
    const late = (await applyWork(client, classId, work.id, { deadline: iso(clock, 9 * DAY) })).body as TeacherActivity;
    await client.post(`${base()}/${soon.id}/cancel`, {});
    const list = await client.get(base());
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string; status: string }) => [item.id, item.status])).toEqual([
      [late.id, "ACTIVE"],
      [soon.id, "CANCELLED"],
    ]);
    expect(list.body.items[0].counts.enrolled).toBe(2);

    const otherClass = (await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id })).schoolClass.id;
    expect((await client.get(`/api/classes/${otherClass}/activities/${late.id}`)).status).toBe(404);
    expect((await client.post(`/api/classes/${otherClass}/activities/${late.id}/close`, {})).status).toBe(404);
    expect((await client.get(`${base()}/${randomUUID()}`)).status).toBe(404);
  });
});
