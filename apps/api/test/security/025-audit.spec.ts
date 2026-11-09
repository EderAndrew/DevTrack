import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { dismissNudge, getStudentNudge, type NudgeScene, nudgeScene, occur, roomRow, sendNudge } from "../helpers/exam-nudges";
import { getTimeline } from "../helpers/integrity";
import { LogCapture } from "../helpers/log-capture";
import { mobileApi } from "../helpers/mobile";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MARKER = "MARCADOR-AVISO-025";
/** What the student's dialog says (web `features/exam-nudge`): it lives only in the web and the app, never on the wire. */
const NUDGE_TEXT = "o professor está acompanhando suas ações";
const NUDGE_TITLE = "Mensagem do professor";

/**
 * 025/SC-006 (contracts/audit-events.md, FR-016): with the student's name, e-mail and RA and the exam's title carrying
 * `MARCADOR-AVISO-025`, a whole cycle — a refused send, the send, the repeated send, the room, the timeline, the
 * student's poll and "Entendi" — leaves the marker and the warning's text out of `audit_events` and the captured logs;
 * the audit metadata holds only ids, enums and counts, and no answer says "fraude", "cola" or "violação".
 */
describe("025/SC-006 nenhum nome, título ou texto do aviso nos registros", () => {
  let t: TestApp;
  let clock: FixedClock;
  const logs = new LogCapture();

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
    clock.set(new Date());
  });

  /** The scene with one occurrence, then the marker in the student's and the exam's names. */
  const markedScene = async (): Promise<NudgeScene> => {
    const scene = await nudgeScene(t, clock, { occurrences: 1 });
    await t.prisma.user.update({ where: { id: scene.student.id }, data: { name: `Aluna ${MARKER}`, email: `aluna.${MARKER.toLowerCase()}@example.com` } });
    await t.prisma.studentProfile.update({ where: { userId: scene.student.id }, data: { ra: `RA-${MARKER}`, displayName: `Aluna ${MARKER}` } });
    await t.prisma.classActivity.update({ where: { id: scene.activityId }, data: { title: `Prova ${MARKER}` } });
    return scene;
  };

  it("025/SC-006 o ciclo inteiro deixa o marcador e o texto do aviso fora da auditoria e dos logs", async () => {
    const scene = await markedScene();
    const phone = mobileApi(t, scene.token);
    const wire: unknown[] = [];

    // One occurrence: refused (`exam_nudge.send_refused`); a second one lights the bell.
    const refused = await sendNudge(t, scene);
    expect(refused.status).toBe(409);
    wire.push(refused.body);
    await occur(clock, scene, 1);
    const sent = await sendNudge(t, scene);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const again = await sendNudge(t, scene);
    expect(again.status).toBe(200);
    wire.push(sent.body, again.body, await roomRow(t, scene));
    wire.push((await getTimeline(phone, scene.classId, scene.activityId, scene.attemptId)).body);

    // The student's poll shows it with their own name (the only place it goes); "Entendi" closes it.
    const shown = await getStudentNudge(scene.studentClient, scene.activityId);
    expect(shown.body.nudge.studentName).toBe(`Aluna ${MARKER}`);
    const dismissed = await dismissNudge(scene.studentClient, scene.activityId, sent.body.nudge.id);
    expect(dismissed.status).toBe(200);
    expect((await dismissNudge(scene.studentClient, scene.activityId, sent.body.nudge.id)).status).toBe(200);
    wire.push(dismissed.body);

    const events = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "exam_nudge." } }, orderBy: { occurredAt: "asc" } });
    expect(events.map((event) => event.type).sort()).toEqual(["exam_nudge.dismissed", "exam_nudge.send_refused", "exam_nudge.sent"]);
    const keys = Object.fromEntries(events.map((event) => [event.type, Object.keys(event.metadata as object).sort()]));
    expect(keys).toEqual({
      "exam_nudge.sent": ["activityId", "nudgeId", "occurrenceCount"],
      "exam_nudge.send_refused": ["activityId", "reason"],
      "exam_nudge.dismissed": ["activityId", "nudgeId"],
    });

    const audit = JSON.stringify(await t.prisma.auditEvent.findMany(), (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
    const text = logs.text();
    for (const secret of [MARKER, MARKER.toLowerCase(), NUDGE_TEXT, NUDGE_TITLE]) {
      expect(audit, `auditoria contém ${secret}`).not.toContain(secret);
      expect(text, `logs contêm ${secret}`).not.toContain(secret);
    }
    // The teacher's answers carry ids, times, statuses and counts: never the text, the e-mail, the RA or a fraud label.
    const teacherWire = JSON.stringify(wire);
    for (const forbidden of [NUDGE_TEXT, NUDGE_TITLE, `RA-${MARKER}`, `aluna.${MARKER.toLowerCase()}`]) expect(teacherWire).not.toContain(forbidden);
    expect(`${teacherWire}${JSON.stringify(shown.body)}`).not.toMatch(/\b(fraude|cola|viola[çc][ãa]o)\b/i);
  });

  it("025/SC-006 a consulta do aluno traz só o id e o nome da conta: nada de e-mail, RA, título ou texto", async () => {
    const scene = await markedScene();
    await occur(clock, scene, 1);
    expect((await sendNudge(t, scene)).status).toBe(201);
    const shown = await getStudentNudge(scene.studentClient, scene.activityId);
    expect(Object.keys(shown.body.nudge).sort()).toEqual(["id", "studentName"]);
    const body = JSON.stringify(shown.body);
    for (const forbidden of [`Prova ${MARKER}`, `RA-${MARKER}`, "@", NUDGE_TEXT, NUDGE_TITLE]) expect(body).not.toContain(forbidden);
  });
});
