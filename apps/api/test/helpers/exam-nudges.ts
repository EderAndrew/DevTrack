import type { ExamMonitor, ExamMonitorStudent } from "@repo/contracts";
import { createAttemptRow, createClassWithStudents } from "./activities";
import type { FixedClock } from "./clock";
import { createUser, loginAs, type TestUser } from "./factories";
import { integrityEvent, recordEvents } from "./integrity";
import { examActivity, mobileApi, openMobileSession } from "./mobile";
import { api, type TestApp } from "./test-app";

type ApiClient = ReturnType<typeof api>;

const SECOND = 1000;

/** `POST …/attempts/:attemptId/exam-nudges` (025/US1), the app's bell. */
export const nudgesPath = (classId: string, activityId: string, attemptId: string) =>
  `/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}/exam-nudges`;

export const monitorPath = (classId: string, activityId: string) => `/api/classes/${classId}/activities/${activityId}/exam-monitor`;

/** An exam in progress: the class's teacher with a MOBILE session, the student present with an attempt. */
export interface NudgeScene {
  teacher: TestUser;
  /** The teacher's MOBILE session secret (the app's bearer). */
  token: string;
  student: TestUser;
  /** The student's web client (the 015 events batch). */
  studentClient: ApiClient;
  classId: string;
  activityId: string;
  attemptId: string;
  /** Other students of the same class, present and started in the same exam (`classmates` option). */
  classmates: { student: TestUser; client: ApiClient; attemptId: string }[];
}

/**
 * An EXAM published 5 min ago (60 min, 15 min start window) with its student marked present and started, and
 * `occurrences` counted occurrences through the real events batch (each past the 2 s grouping window). Needs an
 * app built with the given `FixedClock`.
 */
export async function nudgeScene(
  t: TestApp,
  clock: FixedClock,
  options: { occurrences?: number; teacher?: TestUser; classmates?: number } = {},
): Promise<NudgeScene> {
  const teacher = options.teacher ?? (await createUser(t, { roles: ["TEACHER"], name: "Professora Ana" }));
  const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { students: 1 + (options.classmates ?? 0) });
  const { activity } = await examActivity(t, schoolClass);
  const started: { student: TestUser; client: ApiClient; attemptId: string }[] = [];
  for (const one of students) {
    await t.prisma.activityAttendance.create({
      data: { activityId: activity.id, studentUserId: one.id, classId: schoolClass.id, markedAt: clock.now(), markedById: teacher.id },
    });
    const { attemptId } = await createAttemptRow(t, activity.id, one.id, { startedAt: clock.now() });
    started.push({ student: one, client: api(t, { cookie: await loginAs(t, one) }), attemptId });
  }
  const [own, ...classmates] = started;
  const { token } = await openMobileSession(t, teacher);
  const scene = {
    teacher,
    token,
    student: own!.student,
    studentClient: own!.client,
    classId: schoolClass.id,
    activityId: activity.id,
    attemptId: own!.attemptId,
    classmates,
  };
  await occur(clock, scene, options.occurrences ?? 2);
  return scene;
}

/** `count` counted occurrences through the student's events batch, the clock past the grouping window each time. */
export async function occur(clock: FixedClock, scene: Pick<NudgeScene, "studentClient" | "activityId">, count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const res = await recordEvents(scene.studentClient, scene.activityId, [integrityEvent("SCREEN_LEFT")]);
    if (res.status !== 200) throw new Error(`events batch failed: ${res.status} ${JSON.stringify(res.body)}`);
    clock.advance(5 * SECOND);
  }
}

/** The app's send, with the teacher's bearer (no Origin). */
export const sendNudge = (t: TestApp, scene: Pick<NudgeScene, "token" | "classId" | "activityId" | "attemptId">, body: object = {}) =>
  mobileApi(t, scene.token).post(nudgesPath(scene.classId, scene.activityId, scene.attemptId), body);

/** The student's row of the room, read by the app (the 018 monitor with the bearer). */
export async function roomRow(t: TestApp, scene: Pick<NudgeScene, "token" | "classId" | "activityId" | "student">): Promise<ExamMonitorStudent> {
  const res = await mobileApi(t, scene.token).get(monitorPath(scene.classId, scene.activityId));
  if (res.status !== 200) throw new Error(`monitor failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as ExamMonitor).students.find((row) => row.studentUserId === scene.student.id)!;
}

/** A warning straight in the database (for the stories after US1); dismissed when `dismissedAt` is given. */
export async function createNudge(
  t: TestApp,
  scene: Pick<NudgeScene, "attemptId" | "activityId" | "teacher">,
  options: { sentAt?: Date; dismissedAt?: Date } = {},
): Promise<{ id: string; sentAt: Date }> {
  const row = await t.prisma.examNudge.create({
    data: { attemptId: scene.attemptId, activityId: scene.activityId, sentByUserId: scene.teacher.id, sentAt: options.sentAt ?? new Date() },
  });
  if (options.dismissedAt) await dismissByHand(t, row.id, options.dismissedAt);
  return { id: row.id, sentAt: row.sentAt };
}

/** `GET /me/activities/:activityId/attempt/exam-nudge` (025/US2): the exam page's poll. */
export const studentNudgePath = (activityId: string) => `/api/me/activities/${activityId}/attempt/exam-nudge`;

export const getStudentNudge = (client: ApiClient, activityId: string) => client.get(studentNudgePath(activityId));

/** `POST …/exam-nudge/:nudgeId/dismiss` (025/US2): "Entendi", the body exactly `{}`. */
export const dismissNudge = (client: ApiClient, activityId: string, nudgeId: string, body: object = {}) =>
  client.post(`${studentNudgePath(activityId)}/${nudgeId}/dismiss`, body);

/** The student's dismissal written straight in the database (for the teacher's views). */
export const dismissByHand = (t: TestApp, nudgeId: string, at: Date) => t.prisma.examNudge.update({ where: { id: nudgeId }, data: { dismissedAt: at } });
