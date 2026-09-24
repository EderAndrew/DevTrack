import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  loginAs,
  syllabusFixture,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };
const PARALLEL = 5;

/**
 * 004/SC-009: concurrent requests leave consistent data, guaranteed by the database (unique
 * indexes, advisory and row locks, the plan's conditional revision update, SKIP LOCKED).
 */
describe("004/SC-009 concorrência na área do professor", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  async function teacherWithSubject() {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    return { teacher, subject, client: api(t, { cookie: await loginAs(t, teacher) }) };
  }

  /** A plannable class with a plan (revision 1) and `dates` as its meetings. */
  async function planned(dates: string[] = []) {
    const { teacher, subject, client } = await teacherWithSubject();
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, [{ items: ["Classes"] }]);
    const meetings = await createMeetings(t, schoolClass.id, dates);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id);
    return { client, schoolClass, meetings, plan };
  }

  const orphanTopics = async () => {
    const [row] = await t.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM topics t
      LEFT JOIN class_meetings m ON m.id = t.meeting_id
      WHERE t.meeting_id IS NOT NULL AND m.id IS NULL`;
    return row!.count;
  };

  it("envio simultâneo do mesmo arquivo → uma versão", async () => {
    const { subject, client } = await teacherWithSubject();
    const send = () =>
      client.upload(`/api/subjects/${subject.id}/syllabus-documents`, {
        bytes: syllabusFixture("poo.pdf"),
        filename: "poo.pdf",
        contentType: "application/pdf",
      });

    const results = await Promise.all(Array.from({ length: PARALLEL }, send));

    expect(results.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((res) => res.body.document.id)).size).toBe(1);
    expect(await t.prisma.syllabusDocument.count({ where: { subjectId: subject.id } })).toBe(1);
    expect(await t.prisma.storedFile.count()).toBe(1);
  });

  it("envios simultâneos de arquivos diferentes → versões 1 e 2, sem buraco", async () => {
    const { subject, client } = await teacherWithSubject();
    const send = (name: string) =>
      client.upload(`/api/subjects/${subject.id}/syllabus-documents`, { bytes: syllabusFixture(name), filename: name });

    const results = await Promise.all([send("poo.pdf"), send("poo.docx")]);

    expect(results.map((res) => res.status)).toEqual([201, 201]);
    const versions = await t.prisma.syllabusDocument.findMany({ where: { subjectId: subject.id }, orderBy: { version: "asc" } });
    expect(versions.map((document) => document.version)).toEqual([1, 2]);
  });

  it("gravações simultâneas no mesmo planejamento com o mesmo planRevision → uma aceita, as outras 409", async () => {
    const { client, schoolClass, plan } = await planned();
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, (_, index) =>
        client.post(`/api/classes/${schoolClass.id}/plan/topics`, { planRevision: plan.revision, title: `T${index}`, itemIds: [] }),
      ),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409).map((res) => res.body.code)).toEqual(
      Array(PARALLEL - 1).fill("PLAN_REVISION_CONFLICT"),
    );
    expect(await t.prisma.topic.count({ where: { planId: plan.id } })).toBe(1);
    expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(plan.revision + 1);
  });

  it("a mesma data acrescentada por pedidos simultâneos → um encontro", async () => {
    const { teacher, subject, client } = await teacherWithSubject();
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        client.put(`/api/classes/${schoolClass.id}/meetings`, { planRevision: null, add: ["2027-03-03"], remove: [], resolutions: [] }),
      ),
    );

    expect(results.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    expect(await t.prisma.classMeeting.count({ where: { classId: schoolClass.id } })).toBe(1);
    // Only the request that added it records the change.
    expect(await t.prisma.auditEvent.count({ where: { type: "class_meetings.updated" } })).toBe(1);
  });

  it("remoção de encontro contra MOVE de tópico para ele → uma falha, nenhum tópico órfão", async () => {
    const { client, schoolClass, meetings, plan } = await planned(["2027-03-03", "2027-03-10"]);
    const topic = await createTopic(t, plan.id, { meetingId: meetings[0]!.id });

    const [removal, move] = await Promise.all([
      client.put(`/api/classes/${schoolClass.id}/meetings`, {
        planRevision: plan.revision,
        add: [],
        remove: ["2027-03-10"],
        resolutions: [],
      }),
      client.put(`/api/classes/${schoolClass.id}/plan/topic-order`, {
        planRevision: plan.revision,
        items: [{ topicId: topic.id, meetingId: meetings[1]!.id }],
      }),
    ]);

    expect([removal.status, move.status].sort()).toEqual([200, 409]);
    expect(await orphanTopics()).toBe(0);
    const stored = await t.prisma.topic.findUniqueOrThrow({ where: { id: topic.id } });
    const meetingIds = (await t.prisma.classMeeting.findMany({ where: { classId: schoolClass.id } })).map((meeting) => meeting.id);
    expect(meetingIds).toContain(stored.meetingId);
  });

  it("dois runOnce com o lease vencido → um único executor", async () => {
    const { subject } = await teacherWithSubject();
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSING" });
    const worker = t.get(SyllabusProcessingWorker);
    const later = new Date(Date.now() + 10 * 60 * 1000);

    const claimed = await Promise.all([worker.runOnce(later), worker.runOnce(later)]);

    expect(claimed.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({
      processingStatus: "PROCESSED",
      attempts: 2,
    });
    expect(await t.prisma.auditEvent.count({ where: { type: "syllabus.processed", targetId: document.id } })).toBe(1);
  });
});
