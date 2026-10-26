import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { DAY, FixedClock } from "../helpers/clock";
import { createUser, loginAs } from "../helpers/factories";
import { feedbackBody, sendFeedback } from "../helpers/feedback";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const MARKER = "MARCADOR-FEEDBACK-020";
const MESSAGE = `${MARKER} a página travou ao salvar a resposta.`;
const ORIGIN = `/${MARKER}/painel`;

/**
 * 020/SC-004 (contracts/audit-events.md, research J10): every flow of the feature — send, repeat,
 * limit, the ADMIN's reads, status changes, a refused transition and the retention job — leaves the
 * message and the origin path out of the audit trail and the logs. Each event carries exactly the
 * metadata of the contract; reads, a returned existing feedback and a refused transition write none.
 */
describe("020/SC-004 nenhum texto de feedback nem tela de origem na auditoria e nos logs", () => {
  let t: TestApp;
  let clock: FixedClock;
  let logs: LogCapture;
  let studentId: string;
  let adminId: string;
  let student: Client;
  let admin: Client;

  const events = () =>
    t.prisma.auditEvent.findMany({
      where: { type: { startsWith: "student_feedback." } },
      orderBy: { id: "asc" },
      select: { type: true, actorType: true, actorUserId: true, targetType: true, targetId: true, metadata: true },
    });

  beforeAll(async () => {
    clock = new FixedClock("2026-10-25T12:00:00.000Z");
    logs = new LogCapture();
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
    const studentUser = await createUser(t, { roles: ["STUDENT"] });
    const adminUser = await createUser(t, { roles: ["ADMIN"] });
    studentId = studentUser.id;
    adminId = adminUser.id;
    student = api(t, { cookie: await loginAs(t, studentUser) });
    admin = api(t, { cookie: await loginAs(t, adminUser) });
  });

  it("020/SC-004 cada fluxo grava só ids e enums, e nada do texto chega à auditoria ou aos logs", async () => {
    const body = feedbackBody({ message: MESSAGE, originPath: ORIGIN });
    const first = await student.post("/api/me/feedbacks", body);
    expect(first.status).toBe(201);
    const id: string = first.body.id;

    // The same submission again: the existing feedback, no event.
    const repeated = await student.post("/api/me/feedbacks", body);
    expect(repeated.status).toBe(200);
    expect(repeated.body.id).toBe(id);
    for (let i = 0; i < 4; i += 1) expect((await sendFeedback(student, { message: MESSAGE, originPath: ORIGIN })).status).toBe(201);
    const limited = await sendFeedback(student, { message: MESSAGE, originPath: ORIGIN });
    expect(limited.status).toBe(429);

    // The ADMIN's reads write nothing.
    expect((await admin.get("/api/feedbacks")).status).toBe(200);
    expect((await admin.get("/api/feedbacks?status=RECEIVED&category=PROBLEM")).status).toBe(200);
    expect((await admin.get("/api/feedbacks/summary")).status).toBe(200);
    const detail = await admin.get(`/api/feedbacks/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.message).toBe(MESSAGE);
    expect((await student.get("/api/me/feedbacks")).status).toBe(200);

    expect((await admin.post(`/api/feedbacks/${id}/status`, { status: "IN_REVIEW" })).status).toBe(200);
    expect((await admin.post(`/api/feedbacks/${id}/status`, { status: "IN_REVIEW" })).status).toBe(409);
    expect((await admin.post(`/api/feedbacks/${id}/status`, { status: "RESOLVED" })).status).toBe(200);

    const written = await events();
    expect(written.map(({ type }) => type)).toEqual([
      ...Array(5).fill("student_feedback.submitted"),
      "student_feedback.rate_limited",
      "student_feedback.status_changed",
      "student_feedback.status_changed",
    ]);
    for (const event of written.filter(({ type }) => type === "student_feedback.submitted")) {
      expect(event).toMatchObject({ actorType: "USER", actorUserId: studentId, targetType: "STUDENT_FEEDBACK", metadata: { category: "PROBLEM" } });
      expect(Object.keys(event.metadata as object)).toEqual(["category"]);
    }
    expect(written[5]).toMatchObject({ actorType: "USER", actorUserId: studentId, targetId: null, metadata: { scope: "student-feedback" } });
    expect(Object.keys(written[5]!.metadata as object)).toEqual(["scope"]);
    expect(written.slice(6).map(({ actorUserId, targetId, metadata }) => ({ actorUserId, targetId, metadata }))).toEqual([
      { actorUserId: adminId, targetId: id, metadata: { fromStatus: "RECEIVED", toStatus: "IN_REVIEW" } },
      { actorUserId: adminId, targetId: id, metadata: { fromStatus: "IN_REVIEW", toStatus: "RESOLVED" } },
    ]);

    // The content was stored where it belongs (the scan below is not vacuous).
    const stored = JSON.stringify(await t.prisma.studentFeedback.findMany({ select: { message: true, originPath: true } }));
    expect(stored).toContain(MESSAGE);
    expect(stored).toContain(ORIGIN);

    // The retention job (24 months + 1 day later) deletes it, with no event and no text in the logs.
    const purged = await t.get(MaintenanceService).run({ job: "student-feedback", now: new Date(clock.now().getTime() + 732 * DAY) });
    expect(purged).toEqual({ status: "completed", results: [{ job: "student-feedback", removed: 1 }] });
    expect(await events()).toHaveLength(written.length);

    // SC-004: the scan.
    const everyEvent = JSON.stringify(await t.prisma.auditEvent.findMany({ select: { type: true, targetId: true, metadata: true } }));
    expect(everyEvent).not.toContain(MARKER);
    expect(everyEvent).not.toContain("painel");
    expect(everyEvent).not.toContain("travou");
    expect(logs.text().length).toBeGreaterThan(0);
    expect(logs.text()).not.toContain(MARKER);
    expect(logs.text()).not.toContain("travou");
  });
});
